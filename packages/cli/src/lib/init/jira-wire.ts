import { join } from 'node:path';
import { type IDE, IDE_ORDER } from '../detect.js';
import {
  mergeExternalCodexServer,
  readExternalCodexServerPresence,
  removeExternalCodexServer,
} from './external-codex-merge.js';
import {
  type McpEntry,
  mergeExternalMcpServer,
  readExternalMcpServerPresence,
  removeExternalMcpServer,
} from './external-mcp-merge.js';
import type { WriteOutcome } from './types.js';
import { defaultWindsurfMcpConfigPath } from './windsurf-merge.js';

/**
 * `jira-wire.ts` — the Jira-specific wiring core shared by
 * `coodra jira {enable,disable,status}` and `coodra init`'s optional
 * Jira step.
 *
 * Module 09, Track 9A (Jira = Direct, ADR-016). Atlassian ships its own
 * **remote** MCP server ("Rovo") at
 * `https://mcp.atlassian.com/v1/mcp/authv2` — Streamable HTTP, per-user
 * OAuth 2.1. Coodra consumes it the same way it consumes Graphify: wire
 * the vendor's MCP next to the `coodra` entry and let the agent call
 * Atlassian's own Jira tools (`getJiraIssue`, `searchJiraIssuesUsingJql`,
 * `addCommentToJiraIssue`, …). Coodra builds NO Jira client, OAuth, ADF
 * converter, webhooks, or `jira_*` tools.
 *
 * The structural difference from Graphify: Graphify is **stdio**
 * (`{ command, args }`); Rovo is **remote** (`url`). The native remote
 * entry shape differs per client, so `buildJiraEntry` is per-IDE:
 *   - Claude Code → `{ type: 'http', url }`
 *   - Cursor      → `{ url }`
 *   - Windsurf    → `{ serverUrl }`
 *   - Codex       → `{ url }` table + the top-level
 *                   `experimental_use_rmcp_client = true` flag
 * Per the 2026-05-31 decision, Coodra writes the **native** entry only —
 * no `npx mcp-remote` shim. All four target agents support native remote.
 *
 * The idempotent never-clobber merge lives in the 9·Core substrate —
 * `external-mcp-merge.ts` (JSON: Claude Code / Cursor / Windsurf) and
 * `external-codex-merge.ts` (TOML: Codex). OAuth is each client's own
 * native flow (`/mcp` in Claude Code); Coodra wires nothing auth-related.
 */

/**
 * Re-exported so consumers (the `coodra jira` command, the web-v2
 * `/settings/integrations` surface) get the canonical agent type +
 * ordered list from the jira module without reaching into
 * `lib/detect.ts` directly.
 */
export { type IDE, IDE_ORDER };

/** The `mcpServers` / `mcp_servers` key under which Rovo is wired. */
export const JIRA_SERVER_NAME = 'atlassian';

/**
 * Atlassian's Remote MCP (Rovo) IDE-auth endpoint. Streamable HTTP. The
 * legacy `/v1/sse` endpoint is deprecated (unsupported after 2026-06-30);
 * `/v1/mcp/authv2` is the variant Atlassian's IDE-setup docs use.
 */
export const ROVO_MCP_URL = 'https://mcp.atlassian.com/v1/mcp/authv2';

/**
 * Top-level Codex flag required for a remote (Streamable HTTP) MCP
 * server. Without it Codex treats `mcp_servers.*` as stdio-only and the
 * `url` table is inert. Set on enable; never stripped on disable (it is
 * global — another remote server may still rely on it).
 */
export const CODEX_REMOTE_TOPLEVEL: Record<string, unknown> = { experimental_use_rmcp_client: true };

/**
 * Resolve the agent's MCP-config path for `ide`. Claude Code, Cursor and
 * Codex are project-scoped (under `cwd`); Windsurf's config is global
 * (under `userHome`). Identical resolution to `graphifyConfigPath`.
 */
export function jiraConfigPath(ide: IDE, cwd: string, userHome: string): string {
  switch (ide) {
    case 'claude':
      return join(cwd, '.mcp.json');
    case 'cursor':
      return join(cwd, '.cursor', 'mcp.json');
    case 'windsurf':
      return defaultWindsurfMcpConfigPath(userHome);
    case 'codex':
      return join(cwd, '.codex', 'config.toml');
  }
}

/**
 * Build the native remote Rovo MCP entry for `ide`. The per-client key
 * differences are the whole reason this is a switch: Claude Code wants
 * `{ type: 'http', url }`, Windsurf wants `{ serverUrl }`, and Cursor +
 * Codex read a bare `{ url }`.
 */
export function buildJiraEntry(ide: IDE): McpEntry {
  switch (ide) {
    case 'claude':
      return { type: 'http', url: ROVO_MCP_URL };
    case 'windsurf':
      return { serverUrl: ROVO_MCP_URL };
    default:
      // Cursor reads a bare `url`; Codex's TOML table is also `url`-keyed
      // (paired with the top-level rmcp flag set in `wireJira`).
      return { url: ROVO_MCP_URL };
  }
}

export interface WireJiraOptions {
  readonly ide: IDE;
  readonly cwd: string;
  readonly userHome: string;
  readonly force: boolean;
  readonly dryRun: boolean;
}

/**
 * Idempotently add the `atlassian` (Rovo) remote MCP entry to `ide`'s
 * config. Dispatches to the JSON or TOML 9·Core writer; Codex also gets
 * the top-level `experimental_use_rmcp_client` flag. Preserves the
 * `coodra` entry and any user edits (a drifted `atlassian` entry is left
 * untouched unless `force`).
 */
export async function wireJira(options: WireJiraOptions): Promise<WriteOutcome> {
  const filePath = jiraConfigPath(options.ide, options.cwd, options.userHome);
  const entry = buildJiraEntry(options.ide);
  if (options.ide === 'codex') {
    return mergeExternalCodexServer({
      filePath,
      name: JIRA_SERVER_NAME,
      entry,
      topLevel: CODEX_REMOTE_TOPLEVEL,
      force: options.force,
      dryRun: options.dryRun,
    });
  }
  return mergeExternalMcpServer({
    filePath,
    name: JIRA_SERVER_NAME,
    entry,
    force: options.force,
    dryRun: options.dryRun,
  });
}

/**
 * Idempotently remove the `atlassian` MCP entry from `ide`'s config. A
 * missing file or missing entry is a no-op. Every other entry (incl.
 * `coodra`) is left untouched. The Codex `experimental_use_rmcp_client`
 * flag is intentionally NOT removed — it is global and another remote
 * server may still need it.
 */
export async function unwireJira(options: {
  readonly ide: IDE;
  readonly cwd: string;
  readonly userHome: string;
  readonly dryRun: boolean;
}): Promise<WriteOutcome> {
  const filePath = jiraConfigPath(options.ide, options.cwd, options.userHome);
  if (options.ide === 'codex') {
    return removeExternalCodexServer({ filePath, name: JIRA_SERVER_NAME, dryRun: options.dryRun });
  }
  return removeExternalMcpServer({ filePath, name: JIRA_SERVER_NAME, dryRun: options.dryRun });
}

export interface JiraServerPresence {
  /** Whether the config file exists. */
  readonly exists: boolean;
  /** Whether the file carries the `atlassian` MCP entry. */
  readonly wired: boolean;
  /** True when the file exists but cannot be parsed. */
  readonly unreadable: boolean;
}

/** Read-only probe — does `ide`'s config carry the `atlassian` entry? */
export async function readJiraPresence(options: {
  readonly ide: IDE;
  readonly cwd: string;
  readonly userHome: string;
}): Promise<JiraServerPresence> {
  const filePath = jiraConfigPath(options.ide, options.cwd, options.userHome);
  if (options.ide === 'codex') {
    return readExternalCodexServerPresence({ filePath, name: JIRA_SERVER_NAME });
  }
  return readExternalMcpServerPresence({ filePath, name: JIRA_SERVER_NAME });
}
