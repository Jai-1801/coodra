# Current Session — 2026-04-28 (Module 03.1 Durable Audit Outbox)

## Goal

Build Module 03.1 (Durable Audit Outbox) end-to-end on `feat/03.1-durable-outbox`. Six slices S0 → S6 per `docs/feature-packs/03.1-durable-outbox/implementation.md`, one commit each, M03/M08a cadence (test/fix/document inline, no separate verification report). Land a context pack at S6 and re-call `contextos__save_context_pack`.

The single load-bearing AC: SIGTERM (or kill -9) mid-PreToolUse with a queued audit write must result in the policy_decisions row landing AFTER restart, not being lost.

## Context loaded

- `docs/feature-packs/03.1-durable-outbox/{spec.md,implementation.md,techstack.md}` — kickoff triplet at HEAD `3a86ccb` post-OQ-sign-off.
- `system-architecture.md` §3.4 (Outbox), §16 pattern 3 (Outbox), §4.3 (idempotency), §7 (fail-open).
- `essentialsforclaude/11-adrs.md` — ADR-006 (BullMQ for cloud queues; explicitly NOT used for the audit outbox per OQ1).
- Prior archived session: `context_memory/sessions/2026-04-27-m01-m02-m03-verification-and-closeout.md` and the previous current-session (M08a build-out and post-08a integration walk).

## Last completed

**Module 03.1 complete.** All 6 slices S0 → S6 landed on `feat/03.1-durable-outbox`. The 7 audit-write `setImmediate` callsites enumerated in OQ5 (5 in bridge run-recorder, 2 in mcp-server) are replaced with `scheduleDurableWrite`; both apps run an `OutboxWorker` that drains `pending_jobs` to its destination tables; lease serialization (30s default) covers the SIGTERM-mid-dispatch reclaim case; doctor checks 21/22/23 surface queue depth, oldest-pending age, and dead-letter count with the OQ3-spec thresholds; check 13 transitions from permanent-yellow placeholder to GREEN. The crash-safety harness `verify-outbox-crash-safety.ts` ran 3× consecutively with both SIGTERM and SIGKILL paths PASS.

5 OQ decisions locked at sign-off 2026-04-27:
- OQ1 — same `pending_jobs` table on Postgres for cloud mode (NOT BullMQ-on-Redis)
- OQ2 — each service owns its own drain worker, lease-serialized; explicit lease-edge regression test added in S1
- OQ3 — retry curve 1s/5s/30s/5min/30min, 6 max attempts, single-table dead-letter; doctor escalation 0=green, 1–10=yellow, >10 OR any >1h=red (S4 implementation matches verbatim)
- OQ4 — 30 second lease timeout
- OQ5 — only audit-write callsites get the durable enqueue (inventory matched: 5 bridge + 2 mcp + 1 shim deletion = 7 + 1)

## Next action

**Squash-merge `feat/03.1-durable-outbox` to `main` after PR review** (M02/M03/M08a pattern). The closeout context pack is in `docs/context-packs/2026-04-28-module-03.1-durable-outbox.md` and has been re-saved via `contextos__save_context_pack`.

Then start **Module 04 (Web App)** per `docs/feature-packs/04-web-app/spec.md`. Module 04's audit-trail surface reads from `runs`, `run_events`, `policy_decisions` populated by the durable outbox, and (if surfaced) from `pending_jobs WHERE status='dead'` for the dead-letter view.

Module 04 entry point: `docs/feature-packs/04-web-app/spec.md`, then `docs/feature-packs/04-web-app/implementation.md`, then `apps/web/`.

## Pre-existing finding (NOT in M03.1 scope)

`__tests__/e2e/policy-decisions-idempotency.test.ts` is broken on `main` because it uses `createDbClient({ mode: 'team', postgres })` which has been SQLite-only since M03 S4 (`createDbClient` always passes `kind: 'local'`). Confirmed pre-existing during S2 by checking out main's source with my changes reverted — same failure. Flagged in the S2 commit message. Owner: a follow-up slice to either delete the test or rewrite it against testcontainers postgres directly.

## Log (append-only per PostToolUse)

- [01:14] On `feat/03.1-durable-outbox` HEAD `3a86ccb` (M03.1 triplet committed). 5 OQ recommendations sign-off received from user. Beginning S0.
- [01:25] S0 commit `f150082` — `feat(db): pending_jobs.{picked_at,failed_at,last_error} + scheduleDurableWrite helper`. Migration 0004 (sqlite + postgres). 6 sqlite integration tests + 1 postgres-migrate assertion (verified live against compose pgvector pg16). 39 db integration tests green. monorepo gates green.
- [01:35] S1 commit `fea2d82` — `feat(cli): OutboxWorker — pickup/lease/dispatch/retry/give-up loop`. types.ts + backoff.ts + worker.ts + dispatcher landed in S2 only. 3 backoff + 11 worker unit tests including the 3 OQ2 lease-race tests (two-worker normal race, two-worker lease-edge race, 10-worker idempotency-storm). monorepo gates green (89 cli unit tests).
- [01:50] S2 commit `108bb82` — `feat(bridge,mcp-server,db): replace 7 setImmediate audit dispatches with scheduleDurableWrite`. Created `packages/db/src/destinations.ts` (insertRunEvent/insertRun/closeRun) and `packages/cli/src/lib/outbox/dispatcher.ts` (canonical routing). Per-app dispatch factories in `apps/{hooks-bridge,mcp-server}/src/lib/outbox-dispatch.ts`. Replaced 4 schedule(...) calls (5 method paths) in bridge run-recorder; replaced setImmediate in mcp-server run-recorder + check-policy/handler.ts; deleted M02 drain shim from mcp-server/index.ts. 6 bridge integration tests + 2 mcp-server integration tests + 1 e2e test switched to `drainOutbox(handle)` worker-based drain. New `outbox-end-to-end.test.ts` (2 cases). Workspace plumbing: `@contextos/cli` adds `@contextos/policy` dep + exposes `./lib/outbox` exports map; both apps and repo-root package.json add `@contextos/cli` workspace dep. Pre-existing finding flagged: `policy-decisions-idempotency.test.ts` was already broken on main since M03 S4 (verified). Gates: 22 turbo tasks green; 37 bridge + 179 mcp-server integration tests green; 5/6 e2e files green.
- [01:55] S3 commit `019dfdd` — `feat(bridge,mcp-server): wire OutboxWorker into service lifecycle`. Both `apps/{hooks-bridge,mcp-server}/src/index.ts` instantiate OutboxWorker after recorder, pass `kick: () => worker.kick()` through createRunRecorder, call worker.start() before serve, and await worker.stop() in the SIGTERM handler before DB close. Production drain path is end-to-end. Gates: 22 turbo tasks + 37 bridge integration + 179 mcp-server integration + 32 e2e (1 skipped pre-existing) all green.
- [02:00] S4 commit `0c3a907` — `feat(cli): doctor checks 21–23 surface pending_jobs queue health; close M03.1 placeholder check 13`. Check 21 (depth: 0–10=green, 11–100=yellow, >100=red), check 22 (oldest age: ≤30s=green, ≤5min=yellow, >5min=red), check 23 (dead-letter per OQ3: 0=green, 1–10=yellow, >10 OR any >1h=red). Check 13 flips to GREEN with closure language. 3 new fixture tests for the threshold transitions. Gates: 22 turbo tasks green; 89 cli unit tests.
- [02:10] S5 commit `d1fff2d` — `test(integration): verify-outbox-crash-safety.ts — SIGTERM + kill -9 mid-Pre, prove the audit row lands after restart`. Spawns bridge subprocess against tmp HOME, fires PreToolUse, then Path A (graceful SIGTERM → restart → poll for row) and Path B (SIGKILL → restart → poll for row). 3× consecutive PASS. verify-sigterm-drain.ts and verify-f5-live.ts re-run → PASS (no regression).
- [02:15] S6 — closeout context pack `docs/context-packs/2026-04-28-module-03.1-durable-outbox.md` authored. current-session.md updated with M03.1 final state + Next action: Module 04 kickoff. Pack saved via `contextos__save_context_pack`.
