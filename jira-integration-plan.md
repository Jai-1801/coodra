# Jira Integration Plan — Module 09 Track 9A (LOCKED 2026-05-31)

> **Live work item — survives compaction.** Two decisions locked with the user
> 2026-05-31. Development starts at J0. This file is the source of truth for the
> Jira track; mirror key decisions into `context_memory/decisions-log.md` and
> record ADR-016 at J0.

## Locked decisions

1. **Approach = Direct.** Wire **Atlassian's official Remote MCP server** (Rovo)
   into the agent config, exactly like `coodra graphify enable` did for
   Graphify (ADR-010 / ADR-015 pattern). The agent calls Atlassian's own Jira
   tools directly. **Coodra builds NO Jira REST client, NO OAuth flow, NO
   ADF↔markdown converter, NO webhook ingress, NO `jira_*` tools.**

2. **Fusion scope = Link + on-request write-back.**
   - **Link:** the Coodra **Run** records `issueRef` (the `runs.issueRef` column
     already exists). Coodra history becomes Jira-aware — "what work touched
     PROJ-412?" is answerable from Coodra's own records, and the Context Pack is
     bound to the ticket.
   - **Write-back (on request only):** at session end, if the user asks, the
     agent posts the Context Pack summary to the linked issue as a comment —
     **via Rovo's own comment tool**, not a Coodra-built write path. Jira is
     shared state; writes are opt-in to avoid noise.

## The value (what it achieves)

Closes the loop between the ticket (where work is defined) and the coding
session (where it's done): **context in** (agent pulls description + acceptance
criteria + comments before coding), **traceability captured** (Run↔issue), and
**record back** (ticket reflects what the agent actually did).

## What Coodra builds vs. does NOT build

| Coodra builds | Atlassian's Rovo MCP provides — Coodra builds NONE of this |
|---|---|
| `coodra jira enable/disable/status` (wires Rovo into agent configs) | `getJiraIssue`, `searchJiraIssuesUsingJql`, `addCommentToJiraIssue`, `transitionJiraIssue`, `createJiraIssue`, … (exact names verified at J0) |
| Run↔issue linkage (`issueRef` capture + Jira-aware history) | OAuth 2.1, token refresh, the Jira REST client |
| Onboarding placement (`coodra init` step + web wizard step + `/settings/integrations` card) | ADF↔markdown conversion |
| Trigger-contract guidance (when to read the ticket / post the summary) | the actual API calls; webhook delivery (N/A — Rovo is pull-only) |

## Lessons applied from the Graphify retirement (ADR-015)

- **NO Epic → Feature Pack auto-transform.** An Epic is not a module blueprint,
  same as a Leiden community isn't. If an epic's scope warrants a Feature Pack,
  a human/agent authors it. No mechanical mint that lands un-reachable.
- **NO rebuild of a mature tool.** Atlassian maintains Rovo (OAuth'd, current,
  free). Reimplementing it is the error we just undid.
- **Keep the fusion small + reachable.** Linkage you can query; write-back you
  can see on the ticket. Nothing minted-and-forgotten.

## Key caveat (known at lock time)

Rovo is **per-user interactive OAuth** — each developer authorizes their own
Atlassian account; it does **not** work headless (CI/cron), same limitation as
claude.ai-style MCPs. Fine for interactive dev sessions (the use case). The ONE
reason to fall back to a "Build" approach later: server-side/headless Jira
access or Jira→Coodra **webhook** events (push). Revisit only if that need is
real.

## The main technical unknown → resolve at J0

Graphify's MCP was **stdio** (`{command, args}` — the `external-mcp-merge.ts`
writer handles that shape). **Rovo is a REMOTE MCP (SSE/HTTP + OAuth).** The
wiring shape is different per IDE:
- Some clients support native remote MCP config (`{ "url": "...", "type": "sse" }`-ish).
- Others (stdio-only) need the `mcp-remote` shim: `npx -y mcp-remote https://mcp.atlassian.com/v1/sse`.
J0 verifies the exact endpoint, OAuth handshake, tool names, and the per-IDE
config shape **online** (per `04-when-in-doubt.md`) before any code.

## Phased plan

### J0 — Spec + ADR-016 (research + docs, NO product code)
- Verify online: Atlassian Remote MCP exact endpoint (`mcp.atlassian.com/v1/...`),
  OAuth 2.1 flow, exact tool names + shapes, and how each target IDE (Claude
  Code / Cursor / Windsurf / Codex) configures a **remote OAuth** MCP (native vs
  `mcp-remote` shim).
- Record findings in `External api and library reference.md` (new Atlassian
  Remote MCP subsection — supersedes the jira.js/REST notes for this track).
- Write **ADR-016** (Direct approach; supersedes §22's Build design — the
  8 `jira_*` tools + OAuth + ADF + webhooks).
- Rewrite `system-architecture.md` §22 to Direct (mirror how ADR-015 rewrote §17).
- Update `essentialsforclaude/05-agent-trigger-contract.md` §5.7: the JIRA
  triggers point at **Rovo's** tool names, and note Coodra doesn't own them.

### J1 — Jira wiring CLI (`coodra jira enable/disable/status`)
- `packages/cli/src/lib/init/jira-wire.ts` (parallel to `graphify-wire.ts`) — but
  for the **remote** entry shape resolved at J0. Per-IDE dispatch over the 9·Core
  substrate (`external-mcp-merge.ts` JSON + `external-codex-merge.ts` TOML);
  extend the writers if remote-MCP entries need a new shape.
- `packages/cli/src/commands/jira.ts` (enable/disable/status), wired in
  `program.ts`.
- `coodra init` optional Jira step (parallel to the Graphify step — opt-in,
  `--jira` / `--no-jira` / prompt).
- Unit + integration tests.

### J2 — Run ↔ issue linkage
- Capture `issueRef` on the Run. Options to decide at J2: (a) a small
  `link_run_to_issue` MCP tool the agent calls, or (b) an optional `issueRef`
  param on `get_run_id`, or (c) bridge SessionStart infers it from branch name.
  Lean toward an explicit agent-set path (a/b) — deterministic, no guessing.
- Make history Jira-aware: `query_run_history` / `query_decisions` surface
  `issueRef`; support "what touched <KEY>?" queries.
- Tests.

### J3 — On-request write-back
- Trigger-contract guidance: at session end, if the user asks, the agent posts
  the Context Pack summary to the linked issue via **Rovo's** comment tool.
  Mostly docs + (optional) a tiny Coodra helper that assembles the summary from
  decisions + context pack + run diff. Keep minimal — the agent already holds
  the pack it's writing.
- Tests.

### J4 — Web onboarding + integrations surface + e2e
- Web `/settings/integrations` Jira card (parallel to the Graphify card):
  wire/unwire + status, `refuseInTeamHosted` gate, CLI-command display in
  team-hosted mode.
- Onboarding wizard Jira step.
- E2E walkthrough + docs + closeout Context Pack.

## ADR numbering note (post-compaction reminder)

The old plan reserved "ADR-015" for the Jira/Rovo decision. **ADR-015 is now the
Graphify retirement** (shipped 2026-05-23). The Jira/Rovo ADR is therefore
**ADR-016**, recorded at J0.
