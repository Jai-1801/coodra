import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveContextosLogsDir } from './contextos-home.js';
import type { DaemonUnit } from './daemon/index.js';
import { findRepoRoot } from './find-repo-root.js';
import { loadHomeEnv } from './load-home-env.js';

export type ServiceName = 'mcp-server' | 'hooks-bridge';

export interface ServiceDescriptor {
  readonly name: ServiceName;
  readonly displayName: string;
  /** Port the service binds to. */
  readonly port: number;
  /** Path under each service binary's repo root, relative to repoRoot. */
  readonly relativeEntry: string;
  /** Health-check URL (uses port). */
  readonly healthUrl: (port: number) => string;
  /** Default port. */
  readonly defaultPort: number;
}

export const SERVICES: readonly ServiceDescriptor[] = [
  {
    name: 'mcp-server',
    displayName: 'ContextOS MCP Server',
    port: 3100,
    defaultPort: 3100,
    relativeEntry: 'apps/mcp-server/dist/index.js',
    healthUrl: (port) => `http://127.0.0.1:${port}/healthz`,
  },
  {
    name: 'hooks-bridge',
    displayName: 'ContextOS Hooks Bridge',
    port: 3101,
    defaultPort: 3101,
    relativeEntry: 'apps/hooks-bridge/dist/index.js',
    healthUrl: (port) => `http://127.0.0.1:${port}/healthz`,
  },
];

export interface BuildServiceUnitOptions {
  readonly contextosHome: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface ResolvedService {
  readonly descriptor: ServiceDescriptor;
  readonly entryPath: string;
  readonly port: number;
  readonly unit: DaemonUnit;
}

/**
 * Build the DaemonUnit each service runs as, given a resolved repo root
 * and the user's env. When the repo root cannot be located (e.g. CLI
 * installed via `npm i -g` outside the monorepo), this throws so `start`
 * surfaces the failure with a readable error.
 */
export async function resolveServices(options: BuildServiceUnitOptions): Promise<ResolvedService[]> {
  // Try the CLI's own install location FIRST, then process.cwd().
  // The CLI lives at `<repo>/packages/cli/dist/lib/services.js` in the dev
  // monorepo, so walking up from `import.meta.url` always finds the repo
  // root that owns the apps/* binaries — regardless of where the operator
  // invoked `contextos start` from. Pre-fix, we used cwd only and a
  // freshly-init'd project directory failed with "Cannot locate the
  // ContextOS repo root", contradicting init's "Run `contextos start`"
  // instruction. Doctor (check 9) and init already use this lookup order;
  // services.ts now matches.
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = (await findRepoRoot(here)) ?? (await findRepoRoot(process.cwd()));
  if (repoRoot === null) {
    throw new Error(
      'Cannot locate the ContextOS repo root from either the CLI install path or the current directory. ' +
        'In 08a `start`/`stop` only work from within the dev monorepo; ' +
        '`npm i -g @contextos/cli` deployment is tracked as a follow-up.',
    );
  }
  // Layer the env: `<CONTEXTOS_HOME>/.env` provides defaults (this is the
  // file `contextos init` writes), then process.env wins (so `MCP_SERVER_PORT=3200
  // contextos start` always overrides the file). Pre-fix, the .env was never
  // read, so daemons booted without the solo-mode sentinels even though
  // `init` had written them — silently breaking team-mode setups and forcing
  // operators to re-export everything in their shell.
  const homeEnv = loadHomeEnv(options.contextosHome);
  const env: NodeJS.ProcessEnv = { ...homeEnv, ...options.env };
  const mcpPort = parsePort(env.MCP_SERVER_PORT, 3100);
  const bridgePort = parsePort(env.HOOKS_BRIDGE_PORT, 3101);

  const logsDir = resolveContextosLogsDir(options.contextosHome);
  return SERVICES.map((descriptor) => {
    const port = descriptor.name === 'mcp-server' ? mcpPort : bridgePort;
    const entryPath = resolve(repoRoot, descriptor.relativeEntry);
    const unitEnv = buildServiceEnv({ env, contextosHome: options.contextosHome, port, name: descriptor.name });
    // pino → stderr per CONTEXTOS_LOG_DESTINATION; both streams routed into
    // <contextos-home>/logs/<name>.log so doctor check 8 can read them and
    // field debugging is possible (vs the pre-fix /dev/null sink).
    const stdoutPath = join(logsDir, `${descriptor.name}.log`);
    const stderrPath = join(logsDir, `${descriptor.name}.log`);
    const unit: DaemonUnit = {
      name: descriptor.name,
      command: process.execPath,
      args: [entryPath],
      env: unitEnv,
      workingDir: repoRoot,
      stdoutPath,
      stderrPath,
    };
    return { descriptor, entryPath, port, unit };
  });
}

function buildServiceEnv(args: {
  readonly env: NodeJS.ProcessEnv;
  readonly contextosHome: string;
  readonly port: number;
  readonly name: ServiceName;
}): Record<string, string> {
  const env: Record<string, string> = {
    CONTEXTOS_LOG_DESTINATION: 'stderr',
    CONTEXTOS_HOME: args.contextosHome,
  };
  // Pattern-forward any operator-supplied secrets / config: every
  // CONTEXTOS_*, every CLERK_*, plus LOCAL_HOOK_SECRET and DATABASE_URL.
  // The pattern replaces an earlier hardcoded list that drifted from
  // baseEnvSchema additions (e.g., CONTEXTOS_GRAPHIFY_ROOT, CONTEXTOS_CONTEXT_PACKS_ROOT)
  // and silently dropped them on the way to the daemon.
  // Never log values — they may be production secrets.
  const FORWARD_LITERAL = new Set(['LOCAL_HOOK_SECRET', 'DATABASE_URL']);
  // Vars this function sets explicitly below — operators cannot override
  // these via .env (they're computed per-service from the resolved port).
  const RESERVED = new Set([
    'CONTEXTOS_LOG_DESTINATION',
    'CONTEXTOS_HOME',
    'MCP_SERVER_PORT',
    'MCP_SERVER_TRANSPORT',
    'MCP_SERVER_HOST',
    'HOOKS_BRIDGE_PORT',
    'HOOKS_BRIDGE_HOST',
  ]);
  for (const [key, value] of Object.entries(args.env)) {
    if (typeof value !== 'string' || value.length === 0) continue;
    if (RESERVED.has(key)) continue;
    if (key.startsWith('CONTEXTOS_') || key.startsWith('CLERK_') || FORWARD_LITERAL.has(key)) {
      env[key] = value;
    }
  }
  if (args.name === 'mcp-server') {
    env.MCP_SERVER_PORT = String(args.port);
    env.MCP_SERVER_TRANSPORT = 'http';
    env.MCP_SERVER_HOST = '127.0.0.1';
  } else {
    env.HOOKS_BRIDGE_PORT = String(args.port);
    env.HOOKS_BRIDGE_HOST = '127.0.0.1';
  }
  return env;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return parsed;
}
