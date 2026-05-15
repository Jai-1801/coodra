import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isContextosEntryEqual, type ContextosMcpEntry } from './mcp-merge.js';
import type { WriteOutcome } from './types.js';

/**
 * `packages/cli/src/lib/init/windsurf-merge.ts` — beta.95 (Scope A).
 *
 * Writes the `contextos` MCP entry into Windsurf Cascade's MCP config
 * so a Cascade session can spawn the bundled ContextOS MCP server and
 * call the 26 `contextos__*` tools.
 *
 * **Global, not project-scoped.** Unlike Claude Code (`.mcp.json`) and
 * Codex (`.codex/config.toml`), Windsurf has no project-level MCP
 * config — Cascade only reads `~/.codeium/windsurf/mcp_config.json`.
 * So this writer touches a shared user file, which makes the
 * merge-don't-clobber discipline load-bearing: every server entry the
 * user already has is preserved byte-for-byte; we only ever add or
 * update the `contextos` key.
 *
 * The file shape is identical to `.mcp.json` —
 * `{ "mcpServers": { "<name>": { command, args, env } } }` — so we
 * reuse the `ContextosMcpEntry` shape and the `isContextosEntryEqual`
 * canonical comparator from `mcp-merge.ts`. This module only owns the
 * global-path resolution + the `~/.codeium/windsurf/` mkdir.
 *
 * Merge contract mirrors `mergeMcpJson` (spec §11 Decision 3): an
 * existing drifted `contextos` entry is preserved unless `--force`.
 */

/**
 * Resolve the canonical Windsurf MCP config path. `userHome` override
 * lets tests point at a tmpdir instead of the runner's real home.
 */
export function defaultWindsurfMcpConfigPath(userHome?: string): string {
  const home = userHome ?? homedir();
  return join(home, '.codeium', 'windsurf', 'mcp_config.json');
}

export interface MergeWindsurfMcpConfigOptions {
  readonly entry: ContextosMcpEntry;
  readonly force: boolean;
  readonly dryRun: boolean;
  /** Override `$HOME` for tests. Production callers omit it. */
  readonly userHome?: string;
}

/**
 * Idempotent merge of the `contextos` entry into
 * `~/.codeium/windsurf/mcp_config.json` under `mcpServers.contextos`.
 */
export async function mergeWindsurfMcpConfig(options: MergeWindsurfMcpConfigOptions): Promise<WriteOutcome> {
  const path = defaultWindsurfMcpConfigPath(options.userHome);
  const exists = await pathExists(path);

  if (!exists) {
    const baseline = { mcpServers: { contextos: options.entry } };
    if (!options.dryRun) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    }
    return { path, action: 'wrote', notes: 'created baseline mcp_config.json with contextos entry' };
  }

  const raw = await readFile(path, 'utf8');
  let parsed: { mcpServers?: Record<string, unknown>; [k: string]: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Cannot parse existing ${path}: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${path} must be a JSON object`);
  }

  const servers = (parsed.mcpServers as Record<string, unknown> | undefined) ?? {};
  const existingContextos = servers.contextos;

  if (options.force) {
    parsed.mcpServers = { ...servers, contextos: options.entry };
    if (!options.dryRun) await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    return { path, action: 'forced', notes: 'overwrote contextos entry in mcp_config.json with baseline' };
  }

  if (existingContextos === undefined) {
    parsed.mcpServers = { ...servers, contextos: options.entry };
    if (!options.dryRun) await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    return { path, action: 'merged', notes: 'added contextos entry to existing mcp_config.json' };
  }

  if (isContextosEntryEqual(options.entry, existingContextos)) {
    return { path, action: 'unchanged', notes: 'contextos entry already matches baseline' };
  }

  // Drift: preserve the user's edits (Decision 3).
  return {
    path,
    action: 'unchanged',
    notes: 'contextos entry exists with custom config; pass --force to overwrite with baseline',
  };
}

/**
 * `contextos uninstall` reverse — removes the `contextos` key from
 * `mcpServers` in `~/.codeium/windsurf/mcp_config.json`. Every other
 * server entry is left untouched. Idempotent.
 */
export async function removeWindsurfMcpConfig(options: { dryRun: boolean; userHome?: string }): Promise<WriteOutcome> {
  const path = defaultWindsurfMcpConfigPath(options.userHome);
  const exists = await pathExists(path);
  if (!exists) {
    return { path, action: 'unchanged', notes: 'mcp_config.json does not exist; nothing to remove' };
  }

  const raw = await readFile(path, 'utf8');
  let parsed: { mcpServers?: Record<string, unknown>; [k: string]: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Cannot parse existing ${path}: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${path} must be a JSON object`);
  }

  const servers = (parsed.mcpServers as Record<string, unknown> | undefined) ?? {};
  if (!Object.hasOwn(servers, 'contextos')) {
    return { path, action: 'unchanged', notes: 'no contextos entry to remove' };
  }

  const next: Record<string, unknown> = { ...servers };
  delete next.contextos;
  parsed.mcpServers = next;

  if (!options.dryRun) {
    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  }
  return { path, action: 'merged', notes: 'removed contextos entry from mcp_config.json' };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
