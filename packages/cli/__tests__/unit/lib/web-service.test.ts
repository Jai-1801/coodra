import { beforeEach, describe, expect, it, vi } from 'vitest';

import { restartWebFresh } from '../../../src/lib/web-service.js';

/**
 * Locks `restartWebFresh` — the helper `coodra team init` calls before
 * the chained `coodra login` to bring the bundled web up fresh in team
 * mode (so the browser handoff doesn't hit a stale/solo web that crashes
 * on the clerkMiddleware detection).
 *
 * The daemon + services + health layers are mocked; we assert the
 * stop→install→start→health sequence and the non-throwing contract.
 */

vi.mock('../../../src/lib/load-home-env.js', () => ({
  loadHomeEnv: vi.fn(() => ({ COODRA_MODE: 'team' })),
}));
vi.mock('../../../src/lib/services.js', () => ({
  resolveServices: vi.fn(),
}));
vi.mock('../../../src/lib/daemon/index.js', () => ({
  selectDaemonManager: vi.fn(),
}));
vi.mock('../../../src/lib/wait-for-health.js', () => ({
  waitForHealth: vi.fn(),
}));

async function mocks() {
  const services = await import('../../../src/lib/services.js');
  const daemon = await import('../../../src/lib/daemon/index.js');
  const health = await import('../../../src/lib/wait-for-health.js');
  return {
    resolveServices: services.resolveServices as unknown as ReturnType<typeof vi.fn>,
    selectDaemonManager: daemon.selectDaemonManager as unknown as ReturnType<typeof vi.fn>,
    waitForHealth: health.waitForHealth as unknown as ReturnType<typeof vi.fn>,
  };
}

function webService(port: number | null = 3001) {
  return {
    descriptor: {
      name: 'web',
      kind: 'http' as const,
      displayName: 'Coodra Web',
      healthUrl: (p: number) => `http://127.0.0.1:${p}/api/healthz`,
    },
    unit: { name: 'web' },
    port,
  };
}

function makeManager() {
  return {
    install: vi.fn().mockResolvedValue(undefined),
    uninstall: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

describe('restartWebFresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops, reinstalls, starts the web and waits for health', async () => {
    const m = await mocks();
    const manager = makeManager();
    m.resolveServices.mockResolvedValue([webService(3001)]);
    m.selectDaemonManager.mockResolvedValue(manager);
    m.waitForHealth.mockResolvedValue(true);

    const result = await restartWebFresh({ coodraHome: '/tmp/home' });

    expect(result).toEqual({ ok: true, healthy: true, port: 3001 });
    expect(manager.stop).toHaveBeenCalledWith('web');
    expect(manager.install).toHaveBeenCalledWith({ name: 'web' });
    expect(manager.start).toHaveBeenCalledWith('web');
    expect(m.waitForHealth).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://127.0.0.1:3001/api/healthz' }));
  });

  it('tolerates stop() throwing when the web is not yet running', async () => {
    const m = await mocks();
    const manager = makeManager();
    manager.stop.mockRejectedValueOnce(new Error('no such unit'));
    m.resolveServices.mockResolvedValue([webService(3001)]);
    m.selectDaemonManager.mockResolvedValue(manager);
    m.waitForHealth.mockResolvedValue(true);

    const result = await restartWebFresh({ coodraHome: '/tmp/home' });

    expect(result.ok).toBe(true);
    expect(manager.install).toHaveBeenCalled();
    expect(manager.start).toHaveBeenCalled();
  });

  it('returns ok:false (no throw) when the web service cannot be resolved', async () => {
    const m = await mocks();
    m.resolveServices.mockResolvedValue([{ descriptor: { name: 'mcp-server' }, unit: {}, port: 3100 }]);
    m.selectDaemonManager.mockResolvedValue(makeManager());

    const result = await restartWebFresh({ coodraHome: '/tmp/home' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('web service could not be resolved');
  });

  it('returns ok:false (no throw) when start() fails', async () => {
    const m = await mocks();
    const manager = makeManager();
    manager.start.mockRejectedValueOnce(new Error('launchd bootstrap failed'));
    m.resolveServices.mockResolvedValue([webService(3001)]);
    m.selectDaemonManager.mockResolvedValue(manager);

    const result = await restartWebFresh({ coodraHome: '/tmp/home' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('launchd bootstrap failed');
  });

  it('reports healthy:false when the health probe times out (still ok:true)', async () => {
    const m = await mocks();
    m.resolveServices.mockResolvedValue([webService(3001)]);
    m.selectDaemonManager.mockResolvedValue(makeManager());
    m.waitForHealth.mockResolvedValue(false);

    const result = await restartWebFresh({ coodraHome: '/tmp/home' });

    expect(result).toEqual({ ok: true, healthy: false, port: 3001 });
  });
});
