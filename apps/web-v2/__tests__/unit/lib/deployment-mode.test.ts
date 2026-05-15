import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isCloudHostedWeb,
  resolveDeploymentMode,
  resolveIdentityMode,
} from '../../../lib/deployment-mode';

/**
 * Phase G slice G.8 — `apps/web-v2/lib/deployment-mode.ts` tests.
 *
 * Verifies the new two-mode helpers (`resolveIdentityMode`,
 * `isCloudHostedWeb`) AND the legacy three-mode `resolveDeploymentMode`
 * which is derived from the two new helpers.
 *
 * Mock the `team-config` import to control the laptop config.json
 * fallback path. Env vars are stubbed via vi.stubEnv.
 */

vi.mock('../../../lib/team-config', () => ({
  resolveEffectiveMode: vi.fn(() => 'solo'),
}));

const { resolveEffectiveMode } = await import('../../../lib/team-config');

beforeEach(() => {
  vi.stubEnv('CONTEXTOS_MODE', '');
  vi.stubEnv('CONTEXTOS_DEPLOYMENT', '');
  (resolveEffectiveMode as unknown as ReturnType<typeof vi.fn>).mockReturnValue('solo');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveIdentityMode — Phase G two-mode model', () => {
  it('returns solo when CONTEXTOS_MODE=solo', () => {
    vi.stubEnv('CONTEXTOS_MODE', 'solo');
    expect(resolveIdentityMode()).toBe('solo');
  });

  it('returns team when CONTEXTOS_MODE=team', () => {
    vi.stubEnv('CONTEXTOS_MODE', 'team');
    expect(resolveIdentityMode()).toBe('team');
  });

  it('falls back to config.json::mode when CONTEXTOS_MODE empty', () => {
    (resolveEffectiveMode as unknown as ReturnType<typeof vi.fn>).mockReturnValue('team');
    expect(resolveIdentityMode()).toBe('team');
  });

  it('returns solo when config.json::mode is solo', () => {
    (resolveEffectiveMode as unknown as ReturnType<typeof vi.fn>).mockReturnValue('solo');
    expect(resolveIdentityMode()).toBe('solo');
  });

  it('ignores invalid CONTEXTOS_MODE values', () => {
    vi.stubEnv('CONTEXTOS_MODE', 'garbage');
    (resolveEffectiveMode as unknown as ReturnType<typeof vi.fn>).mockReturnValue('team');
    expect(resolveIdentityMode()).toBe('team');
  });
});

describe('isCloudHostedWeb', () => {
  it('returns true when CONTEXTOS_DEPLOYMENT=team-hosted', () => {
    vi.stubEnv('CONTEXTOS_DEPLOYMENT', 'team-hosted');
    expect(isCloudHostedWeb()).toBe(true);
  });

  it('returns false for any other CONTEXTOS_DEPLOYMENT value', () => {
    vi.stubEnv('CONTEXTOS_DEPLOYMENT', 'local');
    expect(isCloudHostedWeb()).toBe(false);
  });

  it('returns false when CONTEXTOS_DEPLOYMENT unset', () => {
    expect(isCloudHostedWeb()).toBe(false);
  });
});

describe('resolveDeploymentMode (legacy, derived)', () => {
  it('solo + laptop → local-solo', () => {
    vi.stubEnv('CONTEXTOS_MODE', 'solo');
    expect(resolveDeploymentMode()).toBe('local-solo');
  });

  it('team + laptop → local-team', () => {
    vi.stubEnv('CONTEXTOS_MODE', 'team');
    expect(resolveDeploymentMode()).toBe('local-team');
  });

  it('team + cloud → team-hosted', () => {
    vi.stubEnv('CONTEXTOS_MODE', 'team');
    vi.stubEnv('CONTEXTOS_DEPLOYMENT', 'team-hosted');
    expect(resolveDeploymentMode()).toBe('team-hosted');
  });

  it('solo + cloud → team-hosted (legacy quirk: cloud always wins for legacy mode)', () => {
    vi.stubEnv('CONTEXTOS_MODE', 'solo');
    vi.stubEnv('CONTEXTOS_DEPLOYMENT', 'team-hosted');
    // The legacy resolveDeploymentMode returned team-hosted whenever
    // CONTEXTOS_DEPLOYMENT=team-hosted, regardless of MODE. We preserve
    // that for backward compat. Real deployments always set
    // CONTEXTOS_MODE=team alongside, so this edge is theoretical.
    expect(resolveDeploymentMode()).toBe('team-hosted');
  });
});
