import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { ContextosMcpEntry } from './mcp-merge.js';
import type { WriteOutcome } from './types.js';

/**
 * `packages/cli/src/lib/init/codex-merge.ts` — beta.95 (Scope A).
 *
 * Writes the `contextos` MCP entry into Codex CLI's config so a Codex
 * session can spawn the bundled ContextOS MCP server and call the 26
 * `contextos__*` tools.
 *
 * **Project-scoped, not global.** Codex reads MCP servers from either
 * `~/.codex/config.toml` (global) or `<repo>/.codex/config.toml`
 * (project-scoped, trusted projects only). We write the PROJECT file —
 * it's repo-scoped (matches the `.mcp.json` model), `contextos uninstall`
 * can cleanly remove it, and `contextos init` never has to touch the
 * user's shared global Codex config. The one cost: Codex prompts the
 * user to "trust" the project before it loads `.codex/config.toml` —
 * a one-time, expected interaction.
 *
 * The Codex `[mcp_servers.<name>]` STDIO table accepts exactly
 * `command` / `args` / `env` — the same three fields `.mcp.json` uses —
 * so we reuse the `ContextosMcpEntry` built by `mcp-merge.ts`'s
 * `buildContextosMcpEntry`. One source of truth for the entry shape;
 * this module only owns the TOML serialization + idempotent merge.
 *
 * Merge contract mirrors `mergeMcpJson` (spec §11 Decision 3): never
 * destroys user edits — an existing drifted `contextos` entry is
 * preserved unless `--force`; every other table in the file is left
 * byte-untouched (smol-toml round-trips them).
 */

/** True when the entry matches `b` under canonical comparison. */
export function isCodexEntryEqual(a: ContextosMcpEntry, b: unknown): boolean {
  if (typeof b !== 'object' || b === null) return false;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export interface MergeCodexConfigOptions {
  readonly cwd: string;
  readonly entry: ContextosMcpEntry;
  readonly force: boolean;
  readonly dryRun: boolean;
}

/**
 * Idempotent merge of the `contextos` entry into
 * `<cwd>/.codex/config.toml` under the `[mcp_servers.contextos]` table.
 */
export async function mergeCodexConfig(options: MergeCodexConfigOptions): Promise<WriteOutcome> {
  const path = join(options.cwd, '.codex', 'config.toml');
  const exists = await pathExists(path);

  // smol-toml serializes a nested object into the canonical
  // `[mcp_servers.contextos]` + `[mcp_servers.contextos.env]` form.
  const entryAsObject: Record<string, unknown> = { command: options.entry.command };
  if (options.entry.args !== undefined) entryAsObject.args = options.entry.args;
  if (options.entry.env !== undefined) entryAsObject.env = options.entry.env;

  if (!exists) {
    const baseline = { mcp_servers: { contextos: entryAsObject } };
    if (!options.dryRun) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${stringifyToml(baseline)}\n`, 'utf8');
    }
    return { path, action: 'wrote', notes: 'created baseline .codex/config.toml with contextos MCP entry' };
  }

  const raw = await readFile(path, 'utf8');
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Cannot parse existing .codex/config.toml: ${(err as Error).message}`);
  }

  const servers = (parsed.mcp_servers as Record<string, unknown> | undefined) ?? {};
  const existingContextos = servers.contextos;

  if (options.force) {
    parsed.mcp_servers = { ...servers, contextos: entryAsObject };
    if (!options.dryRun) await writeFile(path, `${stringifyToml(parsed)}\n`, 'utf8');
    return { path, action: 'forced', notes: 'overwrote .codex/config.toml contextos entry with baseline' };
  }

  if (existingContextos === undefined) {
    parsed.mcp_servers = { ...servers, contextos: entryAsObject };
    if (!options.dryRun) await writeFile(path, `${stringifyToml(parsed)}\n`, 'utf8');
    return { path, action: 'merged', notes: 'added contextos MCP entry to existing .codex/config.toml' };
  }

  if (isCodexEntryEqual(options.entry, existingContextos)) {
    return { path, action: 'unchanged', notes: 'contextos MCP entry already matches baseline' };
  }

  // Drift: preserve the user's edits (Decision 3).
  return {
    path,
    action: 'unchanged',
    notes: 'contextos MCP entry exists with custom config; pass --force to overwrite with baseline',
  };
}

/**
 * `contextos uninstall` reverse — removes the `contextos` key from
 * `[mcp_servers]` in `<cwd>/.codex/config.toml` if present. Every other
 * table is left untouched. Idempotent: a no-op when there's no entry.
 */
export async function removeCodexConfig(options: { cwd: string; dryRun: boolean }): Promise<WriteOutcome> {
  const path = join(options.cwd, '.codex', 'config.toml');
  const exists = await pathExists(path);
  if (!exists) {
    return { path, action: 'unchanged', notes: '.codex/config.toml does not exist; nothing to remove' };
  }

  const raw = await readFile(path, 'utf8');
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Cannot parse existing .codex/config.toml: ${(err as Error).message}`);
  }

  const servers = (parsed.mcp_servers as Record<string, unknown> | undefined) ?? {};
  if (!Object.hasOwn(servers, 'contextos')) {
    return { path, action: 'unchanged', notes: 'no contextos MCP entry to remove' };
  }

  const next: Record<string, unknown> = { ...servers };
  delete next.contextos;
  parsed.mcp_servers = next;

  if (!options.dryRun) {
    await writeFile(path, `${stringifyToml(parsed)}\n`, 'utf8');
  }
  return { path, action: 'merged', notes: 'removed contextos MCP entry from .codex/config.toml' };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
