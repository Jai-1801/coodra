-- Module 06 (Run Diff, 2026-05-09)
--
-- Adds:
--   - runs.base_sha   — git HEAD SHA captured at SessionStart by the
--                       hooks-bridge. Nullable: pre-2026-05-09 runs +
--                       non-git projects + capture failures all leave
--                       it NULL. The SessionEnd run-diff runner uses
--                       this as the diff baseline.
--   - run_diffs       — one row per run with the unified `git diff`
--                       output scoped to files the agent touched in
--                       run_events (Edit/Write/MultiEdit tool calls).
--                       Soft-failures land as rows with `error` set;
--                       see packages/db/src/schema/sqlite.ts::runDiffs
--                       for the full shape contract.
--
-- Why nullable base_sha + soft-failure rows in run_diffs: every run
-- should produce a queryable record, even when there's nothing to
-- diff. The MCP tool and web view rely on row presence to distinguish
-- "diff failed for these reasons" from "no diff yet — analysis still
-- pending". An empty row with `error='no_edits_in_run'` is the floor.
--
-- Idempotency: PRIMARY KEY (run_id) + the runner does DELETE-then-INSERT
-- in one transaction so a re-played SessionEnd produces a clean row,
-- not a half-stale one. ADR-007 (append-only) is intentionally relaxed
-- here for the same reason it's relaxed for context_packs: a fresh
-- SessionEnd legitimately supersedes a prior incomplete attempt.

ALTER TABLE `runs` ADD `base_sha` text;
--> statement-breakpoint
CREATE TABLE `run_diffs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`base_sha` text,
	`head_sha` text,
	`unified_diff` text DEFAULT '' NOT NULL,
	`files_changed` text DEFAULT '[]' NOT NULL,
	`truncated` integer DEFAULT false NOT NULL,
	`error` text,
	`generated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_diffs_generated_at_idx` ON `run_diffs` (`generated_at`);
