import { selectDaemonManager } from './daemon/index.js';
import { loadHomeEnv } from './load-home-env.js';
import { resolveServices } from './services.js';
import { waitForHealth } from './wait-for-health.js';

/**
 * `lib/web-service.ts` — (re)start the bundled `web` daemon so it picks
 * up the CURRENT `~/.coodra/.env` (`COODRA_MODE`, `CLERK_*`,
 * `COODRA_TEAM_ORG_ID`).
 *
 * Why this exists: `coodra team init` writes the team env and then chains
 * `coodra login`, which opens the browser at the LOCAL web. If the web
 * isn't running — or is a STALE process started before the team flip —
 * the browser hits an error page. A stale web is the nasty case: its
 * Edge-runtime middleware was started without `COODRA_MODE=team`, so it
 * runs as a solo pass-through and never invokes `clerkMiddleware()`,
 * while the Node-runtime layout reads `config.json`→team and calls
 * `auth()` → the page 500s with
 *   "Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()".
 * `/api/healthz` still returns 200 in that state, so a health probe can't
 * catch it — the only robust remedy is to bring the web up fresh from the
 * current env right before the browser handoff.
 *
 * Non-fatal by contract: returns `{ ok:false, error }` instead of
 * throwing, so callers can warn-and-continue (login still attempts).
 */

export interface RestartWebResult {
  /** True when the stop→install→start sequence completed without throwing. */
  readonly ok: boolean;
  /** True when the web answered its health URL within the timeout. */
  readonly healthy: boolean;
  /** The web port, when resolvable. */
  readonly port: number | null;
  /** Failure detail when `ok` is false. */
  readonly error?: string;
}

export async function restartWebFresh(args: {
  readonly coodraHome: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly waitTimeoutMs?: number;
}): Promise<RestartWebResult> {
  const baseEnv = args.env ?? process.env;
  // Home env (COODRA_MODE=team, CLERK_*, …) wins over the parent shell —
  // the machine config is the source of truth here.
  const layered = loadHomeEnv(args.coodraHome);
  const env: NodeJS.ProcessEnv = { ...baseEnv, ...layered };

  let resolved: Awaited<ReturnType<typeof resolveServices>>;
  try {
    resolved = await resolveServices({ coodraHome: args.coodraHome, env });
  } catch (err) {
    return { ok: false, healthy: false, port: null, error: (err as Error).message };
  }
  const web = resolved.find((s) => s.descriptor.name === 'web');
  if (web === undefined) {
    return { ok: false, healthy: false, port: null, error: 'web service could not be resolved' };
  }

  let manager: Awaited<ReturnType<typeof selectDaemonManager>>;
  try {
    manager = await selectDaemonManager({ coodraHome: args.coodraHome });
  } catch (err) {
    return { ok: false, healthy: false, port: web.port, error: (err as Error).message };
  }

  try {
    // Tolerate "not currently running" — stop is idempotent, and a fresh
    // machine has no web unit yet.
    try {
      await manager.stop('web');
    } catch {
      /* web wasn't running; nothing to stop */
    }
    await manager.install(web.unit);
    await manager.start('web');
  } catch (err) {
    return { ok: false, healthy: false, port: web.port, error: (err as Error).message };
  }

  let healthy = false;
  if (web.descriptor.kind === 'http' && web.port !== null) {
    healthy = await waitForHealth({
      url: web.descriptor.healthUrl(web.port),
      timeoutMs: args.waitTimeoutMs ?? 30_000,
    });
  }
  return { ok: true, healthy, port: web.port };
}
