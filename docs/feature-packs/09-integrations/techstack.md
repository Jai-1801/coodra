# Module 09 — External MCP Integrations (techstack)

## The two external MCP servers

### Graphify MCP (track 9B) — query-only (ADR-015)

- **Package:** `graphifyy` on PyPI — `pip install "graphifyy[mcp]"` for the
  server. Python 3.10+. Not an npm package.
- **Server:** `python -m graphify.serve graphify-out/graph.json` — a stdio MCP
  server; hot-reloads when `graph.json` changes on disk.
- **Tools:** `query_graph`, `get_node`, `get_neighbors`, `shortest_path`.
- **Input artifact:** `graphify-out/graph.json` (NetworkX node-link). Built by
  `graphify .` / `graphify update .`; committed to git.
- **Agent-config entry (stdio):**
  `"graphify": { "command": "python", "args": ["-m", "graphify.serve", "graphify-out/graph.json"] }`.
- Coodra mints **no** Feature Packs from the graph (ADR-015). The graph is a
  navigation map, consumed live via Graphify's MCP.

### Atlassian Rovo MCP (track 9A)

- **Server:** `https://mcp.atlassian.com/v1/mcp/authv2` — remote, **Streamable
  HTTP** transport, Atlassian-hosted. (`/v1/sse` is deprecated, unsupported after
  2026-06-30 — do not wire it.)
- **Auth:** OAuth 2.1 + RFC 7591 Dynamic Client Registration, per-user,
  browser-based (`/mcp`). No Coodra OAuth app — each developer authorizes on
  first use. Headless requires an org-admin to enable API-token auth (not the v1
  default).
- **Agent-config entry (remote HTTP):**
  `"atlassian": { "type": "http", "url": "https://mcp.atlassian.com/v1/mcp/authv2" }`
  (Cursor uses `url`; Windsurf `serverUrl`; Codex `url` +
  `experimental_use_rmcp_client = true`; stdio-only clients use the
  `npx mcp-remote` shim).
- **Rovo tools the agent uses:** `getJiraIssue`, `searchJiraIssuesUsingJql`,
  `getVisibleJiraProjects`, `getTransitionsForJiraIssue`, `transitionJiraIssue`,
  `editJiraIssue`, `createJiraIssue`, `addCommentToJiraIssue`. Full surface in
  `External api and library reference.md → Atlassian Remote MCP (Rovo)`.

## New Coodra MCP tools — two (ADR-016)

| Tool | Track | Purpose |
|---|---|---|
| `link_run_to_issue` | 9A | Bind a Run to its Jira key (`runs.issue_ref`). Built at J2: idempotent, normalises the key to uppercase, team-mode `sync_to_cloud` push, `run_not_found` soft-failure. |
| `prepare_jira_comment` | 9A | Built at J3 (read-only): assembles `{ issueRef, body }` from the run's Context Pack + top decisions for on-request write-back; soft-fails `run_not_found` / `not_linked`. The agent posts the body via Rovo's `addCommentToJiraIssue`. |
| `query_run_history`, `query_decisions` (expanded) | 9A | Gained an optional `issueRef` filter (J2) — the "what touched / was decided for PROJ-412?" read path. |

That is the whole delta. No `seed_feature_packs_from_graph` (retired, ADR-015),
no `import_jira_epic` (dropped, ADR-016 — no Epic→Pack transform). The
agent-facing Jira tools come from Rovo; the actual write is Rovo's
`addCommentToJiraIssue` (Coodra's `prepare_jira_comment` only assembles the body).

## Schema — zero new tables

- **Graphify (9B):** zero migrations (and the `structure` block is retired).
- **Jira (9A):** zero migrations. Reuse `runs.issueRef` (already in the schema)
  for Run ⇄ issue. Enablement presence is read from the agent **config file**
  (like Graphify's `readGraphifyPresence`), not a DB table — so no
  `integrations` / `external_links` tables.

## Coodra Features (skill recipes)

- Graphify (9B): none shipped — `graphify-seed-packs` was retired (ADR-015).
- Jira (9A): optionally a thin `jira-writeback` recipe (assemble the Context Pack
  summary → `addCommentToJiraIssue`), decided at J3. No `jira-import-epic`, no
  `jira-promote-to-feature`.

## Wiring components

- `packages/cli/src/lib/init/{external-mcp-merge,external-codex-merge,graphify-wire}.ts`
  — the shared 9·Core writers; `jira-wire.ts` will parallel `graphify-wire.ts`.
- `packages/cli/src/commands/{graphify,jira}.ts` — the subcommands.
- `apps/web-v2/app/settings/integrations/` — the integrations page (9·Core).
