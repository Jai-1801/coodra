-- Module 06 (Run Diff, 2026-05-09) — postgres mirror.
-- See drizzle/sqlite/0011_m06_run_diffs.sql for the full design rationale.

ALTER TABLE "runs" ADD COLUMN "base_sha" text;--> statement-breakpoint
CREATE TABLE "run_diffs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"base_sha" text,
	"head_sha" text,
	"unified_diff" text DEFAULT '' NOT NULL,
	"files_changed" text DEFAULT '[]' NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"error" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_diffs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "run_diffs_generated_at_idx" ON "run_diffs" ("generated_at");
