import { resolve } from 'node:path';
import { resolveContextosDataDb, resolveContextosHome } from '../lib/contextos-home.js';
import { loadHomeEnv } from '../lib/load-home-env.js';
import type { CheckContext } from './types.js';

export interface BuildCheckContextOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly contextosHomeOverride?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  readonly platform?: NodeJS.Platform;
  readonly nodeVersion?: string;
}

export function buildCheckContext(options: BuildCheckContextOptions = {}): CheckContext {
  const baseEnv = options.env ?? process.env;
  const cwd = resolve(options.cwd ?? process.cwd());
  const contextosHome = resolveContextosHome({
    ...(options.contextosHomeOverride !== undefined ? { override: options.contextosHomeOverride } : {}),
    env: baseEnv,
    ...(options.platform !== undefined ? { platform: options.platform } : {}),
  });
  // Phase G+H — merge ~/.contextos/.env (and the project-cwd .env, same
  // precedence as `contextos start` uses to spawn daemons) into the
  // env the checks see. Without this, a user who ran `contextos team
  // setup` would still see CONTEXTOS_MODE=solo / DATABASE_URL=undefined
  // in the doctor checks because the team-mode env vars are written to
  // ~/.contextos/.env, not to the parent shell. The cloud-reachability
  // / sync-queue / sync-lag / sync-dead-letter checks all gate on
  // CONTEXTOS_MODE === 'team' and would all skip — making it look like
  // team mode isn't configured even when it is.
  //
  // Layering: home .env (low precedence) ← cwd .env ← parent shell env
  // (always wins). Same as services.ts::resolveServices.
  const layered = loadHomeEnv(contextosHome, cwd);
  const env: NodeJS.ProcessEnv = { ...layered, ...baseEnv };
  const dataDb = resolveContextosDataDb(contextosHome);
  const mcpPort = parsePortFromEnv(env.MCP_SERVER_PORT, 3100);
  const bridgePort = parsePortFromEnv(env.HOOKS_BRIDGE_PORT, 3101);
  const webPort = parsePortFromEnv(env.CONTEXTOS_WEB_PORT, 3001);

  return {
    contextosHome,
    dataDb,
    cwd,
    env,
    mcpPort,
    bridgePort,
    webPort,
    now: options.now ?? (() => new Date()),
    timeoutMs: options.timeoutMs ?? 2000,
    platform: options.platform ?? process.platform,
    nodeVersion: options.nodeVersion ?? process.versions.node,
  };
}

function parsePortFromEnv(value: string | undefined, fallback: number): number {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}
