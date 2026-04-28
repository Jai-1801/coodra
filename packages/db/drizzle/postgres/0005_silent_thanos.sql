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
-- FK strategy: drizzle's postgres-js migrator runs each migration in a
-- transaction. We drop the FK constraints on the three child tables,
-- swap the parent + child ids, and recreate the FKs. Constraint names
-- match drizzle's convention `{child}_run_id_runs_id_fk`.
CREATE TABLE IF NOT EXISTS "_runid_backfill_0005" (
	"new_id" text PRIMARY KEY NOT NULL,
	"old_id" text NOT NULL,
	"migrated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "_runid_backfill_0005" ("new_id", "old_id")
	SELECT 'run:' || project_id || ':' || session_id || ':' || id, id
	FROM runs
	WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		AND id NOT LIKE 'run:%'
ON CONFLICT (new_id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "run_events" DROP CONSTRAINT IF EXISTS "run_events_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_decisions" DROP CONSTRAINT IF EXISTS "policy_decisions_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "decisions" DROP CONSTRAINT IF EXISTS "decisions_run_id_runs_id_fk";
--> statement-breakpoint
UPDATE run_events SET run_id = m.new_id
	FROM "_runid_backfill_0005" m
	WHERE run_events.run_id = m.old_id;
--> statement-breakpoint
UPDATE policy_decisions SET run_id = m.new_id
	FROM "_runid_backfill_0005" m
	WHERE policy_decisions.run_id = m.old_id;
--> statement-breakpoint
UPDATE decisions SET run_id = m.new_id
	FROM "_runid_backfill_0005" m
	WHERE decisions.run_id = m.old_id;
--> statement-breakpoint
UPDATE runs SET id = m.new_id
	FROM "_runid_backfill_0005" m
	WHERE runs.id = m.old_id;
--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_run_id_runs_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_run_id_runs_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL;
