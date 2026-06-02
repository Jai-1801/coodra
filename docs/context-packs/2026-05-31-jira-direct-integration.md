# Context Pack — Jira Direct Integration (Module 09 Track 9A, J0–J4)

- **Date:** 2026-05-31
- **Module:** 09 — External MCP Integrations, Track 9A (Jira)
- **ADR:** ADR-016 (Jira = Direct; wire Atlassian's Rovo MCP)
- **Status:** J0–J4 COMPLETE. Functionally + UI complete.
- **CLI version:** `@coodra/cli@0.2.0-beta.15` (bundles J1 CLI + J2/J3 mcp-server tools)

## What was built

Jira is consumed **Direct** — Coodra wires **Atlassian's own Remote MCP server
("Rovo")** into the agent config and lets the agent call Atlassian's Jira tools.
Coodra builds **no** Jira REST client, OAuth flow, ADF converter, webhooks, or
`jira_*` tools — all of that is Rovo's. Coodra adds only the thin, reachable
fusion: wire it, link the run to its issue, and (on request) post the summary.

The full loop: **context in** (agent reads tickets via Rovo) → **traceability**
(Run↔issue link; Jira-aware history) → **record back** (on-request comment).

### J0 — Spec (docs only)
- Verified the Atlassian Rovo Remote MCP online: endpoint `https://mcp.atlassian.com/v1/mcp`
  (IDE-auth `/v1/mcp/authv2`), Streamable HTTP, OAuth 2.1 + RFC 7591 DCR (per-user,
  browser `/mcp`); `/v1/sse` deprecated (off 2026-06-30); headless API-token path
  exists but needs org-admin enablement. Verbatim tool names + per-IDE wiring shapes.
- Wrote **ADR-016**; rewrote `system-architecture.md` §22 to Direct; added the
  **Atlassian Remote MCP (Rovo)** subsection to `External api and library reference.md`;
  updated `05-agent-trigger-contract.md` §5.7; aligned `docs/feature-packs/09-integrations/`.

### J1 — Wiring CLI (`coodra jira enable/disable/status`)
- Decision: **native remote entries only, no `mcp-remote` shim** (all four agents
  support native remote).
- Widened the 9·Core writers for native-remote entries: `external-mcp-merge.ts`
  (`RemoteMcpEntry`/`McpEntry`) + `external-codex-merge.ts` (`url` projection +
  idempotent `topLevel` flag for Codex's `experimental_use_rmcp_client`).
- Fixed doctor check 14 to tolerate a remote `atlassian` sibling entry.
- `lib/init/jira-wire.ts` (sibling of `graphify-wire.ts`) + `commands/jira.ts` +
  `program.ts` registration + the `coodra init` Jira step.

### J2 — Run↔issue linkage (manifest 15→16)
- `link_run_to_issue` MCP tool — binds `runs.issue_ref`; idempotent, uppercase-
  normalised, team-mode `sync_to_cloud` push, `run_not_found` soft-failure.
- `query_run_history` + `query_decisions` gained an optional `issueRef` filter —
  "what touched / was decided for PROJ-412?".

### J3 — On-request write-back (manifest 16→17)
- Decision: build the helper tool (not pure guidance).
- `prepare_jira_comment` MCP tool (read-only) — assembles `{ issueRef, body }`
  from the run's Context Pack + top decisions; soft-fails `run_not_found` /
  `not_linked`. **No Jira call** — the agent posts the body via Rovo's
  `addCommentToJiraIssue`, on user request only. (Output schema is `z.union`, not
  `discriminatedUnion` — two `ok:false` branches.)

### J4 — Web + onboarding
- `apps/web-v2/lib/queries/integrations.ts` — `readJiraIntegrationStatus()`.
- `apps/web-v2/lib/actions/integrations.ts` — `enableJiraAction` / `disableJiraAction`
  (`refuseInTeamHosted`, autodetect IDEs, reuse `wireJira`/`unwireJira`).
- `apps/web-v2/app/settings/integrations/page.tsx` — a Jira card next to Graphify
  (local web = per-project enable/disable; team-hosted = `coodra jira enable` CLI).
- Onboarding wizard Step 6 — added a Jira section.
- Bonus: fixed the pre-existing stale `graphify-seed-packs` references (retired in
  ADR-015) in the Graphify card + the onboarding step.

## Decisions made
1. **Direct, not Build** (ADR-016) — wire Rovo; build no Jira client. Reason: same
   lesson as the Graphify retirement (ADR-015) — don't reimplement a maintained
   vendor tool.
2. **Native remote only, no `mcp-remote` shim** (J1) — all four agents support native.
3. **`link_run_to_issue` dedicated tool** over a `get_run_id` param (J2) — explicit
   trigger; accepted manifest 15→16.
4. **`prepare_jira_comment` helper tool** over pure guidance (J3) — consistent,
   sourced summary; accepted manifest 16→17.
5. **No Epic→Feature Pack transform** (ADR-016, carried from ADR-015's lesson).

## Files created / modified (key)
- mcp-server: `src/tools/link-run-to-issue/**`, `src/tools/prepare-jira-comment/**`,
  `src/tools/index.ts`, `src/tools/query-run-history/{schema,handler}.ts`,
  `src/tools/query-decisions/{schema,handler}.ts`; tests under
  `__tests__/{unit,integration}/tools/`; boot + boot-team-mode count → 17.
- cli: `src/lib/init/jira-wire.ts`, `src/commands/jira.ts`, `src/program.ts`,
  `src/commands/init.ts`, `src/lib/init/external-{mcp,codex}-merge.ts`,
  `src/doctor/checks/14-mcp-config-validity.ts`, `package.json` (export + beta.15);
  tests `__tests__/unit/{init/jira-wire,commands/jira}.test.ts`.
- web-v2: `lib/queries/integrations.ts`, `lib/actions/integrations.ts`,
  `app/settings/integrations/page.tsx`, `app/onboarding/team/page.tsx`.
- e2e: `__tests__/e2e/manifest-e2e.test.ts` (EXPECTED_TOOLS → 17; fixed stale seed tool).
- docs: ADR-016, §22, §24, External-api Rovo subsection, README (17 tools),
  09-integrations spec/impl/techstack/meta, §5.7.

## Tests + verification
- **mcp-server:** 267 unit + 159 integration + 21 e2e manifest. Manifest is **17
  tools** (live `tools/list` confirmed); both Jira tools advertised.
- **cli:** 496 unit + 53 integration (J1).
- **web-v2:** 43 unit + `next build` (both routes compile).
- typecheck + Biome clean across mcp-server / cli / web-v2.

## Known issues / limitations
- Rovo is **per-user interactive OAuth** — no headless (CI/cron) without an Atlassian
  org-admin enabling API-token auth. Fine for interactive dev (the use case).
- Windsurf's MCP config is global — the `atlassian` entry is shared across projects.
- `prepare_jira_comment`'s `run link` is the runId (no fabricated web URL; solo has
  no web app).

## What should be built next
- Nothing required — the Jira track is complete. Optional future: a bridge-inferred
  `issueRef` fallback (branch regex / `.coodra.json`); a headless/server-side path
  if a real need surfaces (would revisit "Build" per ADR-016).
- **Pending user action:** publish `@coodra/cli@0.2.0-beta.15` (`npm publish --tag beta
  --access public --otp=<code>`) — rebuild the CLI bundle first (`pnpm --filter
  @coodra/cli build`) so the tarball bundles the 17-tool mcp-server. Then `coodra jira
  enable` + `/mcp` sign-in to exercise live.
