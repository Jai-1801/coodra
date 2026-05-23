# Current Session — 2026-05-21 (Module 09 — External MCP Integrations: planning + G0)

## Goal

Plan Module 09 (External MCP Integrations — Jira + Graphify) and execute **G0** —
the Graphify spec phase: rewrite ADR-010 + `system-architecture.md` §17, correct
the stale Graphify references (§24, External-api-ref, CLAUDE.md §5.6), and create
the `docs/feature-packs/09-integrations/` feature-pack folder.

## Context loaded

- `system-architecture.md` §17 (Graphify), §24 (MCP tool manifest)
- `essentialsforclaude/11-adrs.md` (ADR-010), `05-agent-trigger-contract.md` §5.6
- `External api and library reference.md` — Graphify CLI + Atlassian sections
- Live research: `github.com/safishamsi/graphify` (v0.8.14, 50k★) + the Atlassian Rovo MCP server
- Whole-codebase walkthrough (mcp-server / hooks-bridge / cli / web-v2 / sync-daemon)
- Full plan: `~/.claude/.../memory/module-09-mcp-integrations.md`

## Last completed

Architecture locked (2026-05-21): Module 09 unifies Jira + Graphify as one
pattern — wire an external MCP server + Coodra fusion tools + recipes. Jira =
Direct (Atlassian Rovo MCP), 4 sub-decisions. Graphify = Option C (wire
graphify's own MCP server; retire `query_codebase_graph`; new
`seed_feature_packs_from_graph`; `get_feature_pack` `structure` block). Then G0
spec writes: ADR-010 + §17 rewritten; §24 / §5.6 / External-api-ref Graphify
references corrected; `docs/feature-packs/09-integrations/` created
(spec / implementation / techstack / meta.json). Decisions appended to
`decisions-log.md`. Memory file `module-09-mcp-integrations.md` written.

## Next action

**Jira track — J0 (spec).** The Graphify track (9B) is fully complete (G0–G4).
Module 09 now moves to the Jira track: **J0** rewrites `system-architecture.md`
§22, adds ADR-015 (Jira = Direct, the Atlassian Rovo MCP), and writes the Jira
detail into `docs/feature-packs/09-integrations/`. Then J1 (schema +
`integrations`/`external_links` tables + `link_jira`/`get_jira_link`) → J2
(config wiring + CLI, reusing the 9·Core writers) → J3 (web `/settings/integrations`
Jira card) → J4 (`import_jira_epic` + `prepare_jira_comment` + Jira Features).
Full phased plan: `docs/feature-packs/09-integrations/implementation.md` and the
`module-09-mcp-integrations.md` memory file.

## Log (append-only per PostToolUse)
- Session opened; prior session (M04 Phase 2 S1) archived to `sessions/2026-05-04-module-04-web-app-S0-to-S11.md`.
- Locked Module 09 architecture — Jira (Direct) + Graphify (Option C); decisions appended to `decisions-log.md`.
- Wrote auto-memory file `~/.claude/.../memory/module-09-mcp-integrations.md` + MEMORY.md index entry.
- G0 executed: ADR-010 + §17 rewritten; §24 `query_codebase_graph` marked superseded; External-api-ref Graphify section + CLAUDE.md §5.6 corrected; `docs/feature-packs/09-integrations/` created.
- G1 complete: deleted the `query-codebase-graph` tool + `lib/graphify.ts` + 3 tests; removed `GraphifyClient` from `tool-context.ts` + all wiring (`index.ts`, `env.ts`, `fake-deps.ts`, the e2e `_helpers/boot.ts`); updated 4 test tool-inventories 16→15. Verified: mcp-server typecheck PASS, 249 unit tests pass, `manifest-e2e` + `stdio-roundtrip` e2e green (HTTP transport logs `toolCount: 15`).
- G2 complete: built `coodra__seed_feature_packs_from_graph` (schema/handler/manifest + unit + integration tests) — direct `feature_packs` draft-row write with the Graphify structure embedded in the `content_json` envelope (`meta.structure`) + spec prose; registered in `tools/index.ts`; updated 4 test tool-inventories 15→16. Verified: typecheck PASS, 267 unit tests pass, 20/20 integration suites pass (incl. the new seed integration test; the 2 dist-boot tests needed a clean rebuild — a stale `.tsbuildinfo` had left `dist/bootstrap/` unemitted, a pre-existing artifact, not a regression), `manifest-e2e` + `stdio-roundtrip` e2e green (`toolCount: 16`).
- G2.1 complete: threaded an optional `structure` block through the feature-pack lib — `featurePackStructureSchema` + `metaJsonSchema` + `FeaturePackContent` gain it; `readPackFromDisk` carries it; `get_feature_pack` surfaces it on `pack.content.structure` (wire schema). The seed tool now ALSO writes the on-disk pack files (`<featurePacksRoot>/<slug>/` — spec/implementation/techstack/meta.json, default `${cwd}/docs/feature-packs`) so a seeded pack is `get_feature_pack`-readable once a tech lead activates it; the `status='draft'` DB row keeps it hidden until then. Verified: typecheck PASS, 267 unit, 20/20 integration suites (154 tests — incl. a seed→activate→`get_feature_pack` end-to-end test asserting `pack.content.structure`), e2e green (`toolCount: 16`). Closes the G2 open question.
- G3 core complete: built the 9·Core MCP-config writer `packages/cli/src/lib/init/external-mcp-merge.ts` (generalises `mcp-merge.ts` — parameterised entry `name` + absolute `filePath`; `mergeExternalMcpServer` / `removeExternalMcpServer` / `readExternalMcpServerPresence`; idempotent, never-clobber, `mkdir -p` greenfield). Built `coodra graphify enable|disable|status` (`packages/cli/src/commands/graphify.ts`) — autodetect/`--ide`/`all`, `--python`/`--graph`/`--force`/`--dry-run`/`--json`; writes the `{command:python3, args:['-m','graphify.serve','graphify-out/graph.json']}` entry to Claude/Cursor/Windsurf JSON configs; Windsurf gets an absolute graph path; Codex (TOML) → manual snippet on enable/disable, regex probe on status. Registered the `graphify` group in `program.ts`. Confirmed Graphify MCP invocation against the live README v8 (`python -m graphify.serve`, `graphifyy[mcp]` extra). Verified: CLI typecheck + Biome clean; 426/426 CLI unit tests (47 new — `external-mcp-merge.test.ts` 22 + `graphify.test.ts` 24 + 3 `program.test.ts` wiring; help snapshot updated); real-binary smoke test green (enable preserves a pre-existing `coodra` entry byte-for-byte, re-enable `unchanged`, disable strips only `graphify`). One full-suite run had a doctor port-check flake (#17 `timeout`) — confirmed environmental, passes isolated. Deferred G3 sub-items: `coodra init` Graphify prompt, `graphify-seed-packs` Feature recipe, Codex TOML write path.
- G3 DEFERRED SUB-ITEMS complete (all three): (1) `lib/init/external-codex-merge.ts` — the TOML 9·Core writer (parallels `external-mcp-merge.ts`; `smol-toml`; `mergeExternalCodexServer`/`removeExternalCodexServer`/`readExternalCodexServerPresence`). (2) `lib/init/graphify-wire.ts` — shared per-IDE wiring core (`wireGraphify`/`unwireGraphify`/`readGraphifyPresence` dispatch JSON↔TOML); `commands/graphify.ts` refactored onto it — Codex is now a REAL `[mcp_servers.graphify]` TOML write in enable/disable (the `codex-manual` path retired). (3) `lib/init/graphify-feature.ts` — the bundled `graphify-seed-packs` Feature recipe (embedded TS string; `seedGraphifySeedPacksFeature` writes `docs/features/graphify-seed-packs/feature.md` idempotently + regenerates the index); seeded on `graphify enable` (skippable via `--no-feature`) and on init. `commands/init.ts` — dead "Graphify scan not implemented" stub removed; replaced with a real opt-in 3-state Graphify step (`--graphify`/`--no-graphify`/interactive prompt; NOT wired by default). `program.ts` — `init` gains the `--graphify`/`--no-graphify` pair; `graphify enable` gains `--no-feature`. Verified: CLI typecheck + Biome clean; 458/458 CLI unit tests (49 files); 13/13 `init` integration tests (4 new Graphify-step cases); real-binary smoke tests green — `graphify enable --ide all` writes all 4 agents incl. real Codex TOML + seeds the feature, `disable --ide codex` strips the TOML table, `--no-feature` skips the seed, `coodra init --graphify`/`--no-graphify` both behave correctly. **Graphify track G0–G3 DONE; next is G4 (web UX).**
- G4 complete (Graphify Web UX): exposed `@coodra/cli/lib/init/{graphify-wire,graphify-feature}` + `/lib/detect` via the package exports map (+ re-exported `IDE`/`IDE_ORDER` from `graphify-wire.ts`) so web-v2 reuses the exact 9·Core writers. Built `apps/web-v2/lib/queries/integrations.ts` (per-project Graphify wiring status — `detectIDE` + `readGraphifyPresence`; `cloudHosted` skip) + `lib/actions/integrations.ts` (`enableGraphifyAction`/`disableGraphifyAction` — `refuseInTeamHosted`, autodetect IDEs, `wireGraphify`/`unwireGraphify` + `seedGraphifySeedPacksFeature`, never `--force`) + `app/settings/integrations/page.tsx` (Graphify card — local web = per-project enable/disable list, team-hosted = read-only `coodra graphify enable` command; structured for a future Jira card). Added an Integrations aside-card link on `/settings`. Added an optional, informational Step 6 "Integrations" to the team onboarding wizard (`STEPS` + clamp `<=6` + `StepSixIntegrations` + `StepFiveInvite` forward-nav). Verified: web-v2 typecheck + Biome (`lint` exit 0) clean; 43/43 web-v2 unit tests; `next build` succeeds (`/settings/integrations` route present); runtime smoke — `next start` → `GET /settings/integrations` 200 (Graphify card renders), `GET /onboarding/team?step=6` 200. CLI re-verified 458/458 green after the export-map change. **Graphify track 9B COMPLETE (G0–G4). Module 09 next: Jira track J0.**
