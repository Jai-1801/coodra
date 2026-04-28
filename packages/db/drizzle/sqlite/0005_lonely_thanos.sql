-- Module 04a S6 — Bridge runId format unification (functest finding #9).
-- Backfills bare-UUID `runs.id` rows (legacy bridge format) to the
-- canonical `run:{projectId}:{sessionId}:{uuid}` shape that MCP
-- `get_run_id` produces. Idempotent; running twice is a no-op.
--
-- Reversibility: every rewritten id is recorded in
-- `_runid_backfill_0005` (new_id → old_id, migrated_at). To roll
-- back: run the inverse UPDATEs against runs + run_events +
-- policy_decisions + decisions, ordering identical to the forward
-- direction. The audit table is intentionally retained post-migration
-- so operators can audit which rows changed.
--
-- FK strategy: drizzle's better-sqlite3 migrator runs each migration
-- inside a transaction. `PRAGMA defer_foreign_keys=ON` (SQLite
-- 3.6.19+) defers FK checks until COMMIT, letting us swap parent +
-- child ids in any order. The pragma scope is the current
-- transaction; no global state changes.
CREATE TABLE IF NOT EXISTS `_runid_backfill_0005` (
	`new_id` text PRIMARY KEY NOT NULL,
	`old_id` text NOT NULL,
	`migrated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
INSERT OR IGNORE INTO `_runid_backfill_0005` (`new_id`, `old_id`)
	SELECT 'run:' || project_id || ':' || session_id || ':' || id, id
	FROM runs
	WHERE length(id) = 36
		AND substr(id, 9, 1) = '-'
		AND substr(id, 14, 1) = '-'
		AND substr(id, 19, 1) = '-'
		AND substr(id, 24, 1) = '-'
		AND id NOT LIKE 'run:%';
--> statement-breakpoint
UPDATE run_events SET run_id = (
	SELECT m.new_id FROM `_runid_backfill_0005` m WHERE m.old_id = run_events.run_id
) WHERE run_id IN (SELECT old_id FROM `_runid_backfill_0005`);
--> statement-breakpoint
UPDATE policy_decisions SET run_id = (
	SELECT m.new_id FROM `_runid_backfill_0005` m WHERE m.old_id = policy_decisions.run_id
) WHERE run_id IN (SELECT old_id FROM `_runid_backfill_0005`);
--> statement-breakpoint
UPDATE decisions SET run_id = (
	SELECT m.new_id FROM `_runid_backfill_0005` m WHERE m.old_id = decisions.run_id
) WHERE run_id IN (SELECT old_id FROM `_runid_backfill_0005`);
--> statement-breakpoint
UPDATE runs SET id = (
	SELECT m.new_id FROM `_runid_backfill_0005` m WHERE m.old_id = runs.id
) WHERE id IN (SELECT old_id FROM `_runid_backfill_0005`);
