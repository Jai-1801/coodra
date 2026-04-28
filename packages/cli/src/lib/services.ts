import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveContextosLogsDir } from './contextos-home.js';
import type { DaemonUnit } from './daemon/index.js';
import { findRepoRoot } from './find-repo-root.js';
import { loadHomeEnv } from './load-home-env.js';

export type ServiceName = 'mcp-server' | 'hooks-bridge' | 'sync-daemon';

/**
 * Service descriptors are a discriminated union: HTTP services bind to
 * a port and expose `/healthz`; worker services (sync-daemon, M04a)
 * expose no port and are tracked via the daemon-manager's PID file.
 */
export interface HttpServiceDescriptor {
  readonly kind: 'http';
  readonly name: ServiceName;
  readonly displayName: string;
  readonly port: number;
  readonly defaultPort: number;
  readonly relativeEntry: string;
  readonly healthUrl: (port: number) => string;
}

export interface WorkerServiceDescriptor {
  readonly kind: 'worker';
  readonly name: ServiceName;
  readonly displayName: string;
  readonly relativeEntry: string;
  /** Worker only launches when CONTEXTOS_MODE=team (DATABASE_URL set). */
  readonly requiresTeamMode: true;
}

export type ServiceDescriptor = HttpServiceDescriptor | WorkerServiceDescriptor;

export const SERVICES: readonly ServiceDescriptor[] = [
  {
    kind: 'http',
    name: 'mcp-server',
    displayName: 'ContextOS MCP Server',
    port: 3100,
    defaultPort: 3100,
    relativeEntry: 'apps/mcp-server/dist/index.js',
    healthUrl: (port) => `http://127.0.0.1:${port}/healthz`,
  },
  {
    kind: 'http',
    name: 'hooks-bridge',
    displayName: 'ContextOS Hooks Bridge',
    port: 3101,
    defaultPort: 3101,
    relativeEntry: 'apps/hooks-bridge/dist/index.js',
    healthUrl: (port) => `http://127.0.0.1:${port}/healthz`,
  },
  {
    kind: 'worker',
    name: 'sync-daemon',
    displayName: 'ContextOS Sync Daemon',
    relativeEntry: 'apps/sync-daemon/dist/index.js',
    requiresTeamMode: true,
  },
];

export interface BuildServiceUnitOptions {
  readonly contextosHome: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface ResolvedService {
  readonly descriptor: ServiceDescriptor;
  readonly entryPath: string;
  /** Present only for HTTP services. Workers report `null`. */
  readonly port: number | null;
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
  // Layer the env, low → high precedence:
  //   1. `<CONTEXTOS_HOME>/.env`  — user-global defaults
  //   2. `<process.cwd()>/.env`   — per-project overrides (this is where
  //                                 `contextos init` writes)
  //   3. options.env (process.env) — explicit shell exports always win
  // The two-file split matters because `init` writes (2) but commit
  // 34faa0e's first cut only read (1); the .env init wrote was therefore
  // decorative end-to-end and team-mode setups silently fell back to solo.
  // See `loadHomeEnv` for the layering rationale.
  const layered = loadHomeEnv(options.contextosHome, process.cwd());
  const env: NodeJS.ProcessEnv = { ...layered, ...options.env };
  const mcpPort = parsePort(env.MCP_SERVER_PORT, 3100);
  const bridgePort = parsePort(env.HOOKS_BRIDGE_PORT, 3101);

  const logsDir = resolveContextosLogsDir(options.contextosHome);
  const isTeamMode = env.CONTEXTOS_MODE === 'team';
  const resolved: ResolvedService[] = [];
  for (const descriptor of SERVICES) {
    // Module 04a: skip workers that require team mode when in solo. The
    // sync-daemon has no purpose without DATABASE_URL.
    if (descriptor.kind === 'worker' && descriptor.requiresTeamMode && !isTeamMode) continue;

    const port = descriptor.kind === 'http' ? (descriptor.name === 'mcp-server' ? mcpPort : bridgePort) : null;
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
    resolved.push({ descriptor, entryPath, port, unit });
  }
  return resolved;
}

function buildServiceEnv(args: {
  readonly env: NodeJS.ProcessEnv;
  readonly contextosHome: string;
  readonly port: number | null;
  readonly name: ServiceName;
}): Record<string, string> {
  const env: Record<string, string> = {
    CONTEXTOS_LOG_DESTINATION: 'stderr',
    CONTEXTOS_HOME: args.contextosHome,
  };
  const FORWARD_LITERAL = new Set(['LOCAL_HOOK_SECRET', 'DATABASE_URL']);
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
  if (args.name === 'mcp-server' && args.port !== null) {
    env.MCP_SERVER_PORT = String(args.port);
    env.MCP_SERVER_TRANSPORT = 'http';
    env.MCP_SERVER_HOST = '127.0.0.1';
  } else if (args.name === 'hooks-bridge' && args.port !== null) {
    env.HOOKS_BRIDGE_PORT = String(args.port);
    env.HOOKS_BRIDGE_HOST = '127.0.0.1';
  }
  // sync-daemon: no port-bound env. DATABASE_URL is forwarded via the
  // FORWARD_LITERAL pattern above; the daemon's env validation (Zod)
  // refuses to boot without it.
  return env;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return parsed;
}
