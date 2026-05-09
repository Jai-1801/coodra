-- Module 04 Phase 4 — Team Migration Tracking (2026-05-09) — postgres-only.
--
-- These tables exist on the cloud Postgres only; SQLite has no mirror
-- because migration is one-way (solo → team) at the data layer. See
-- packages/db/src/schema/postgres.ts::migrationAttempts for the full
-- design rationale.
--
-- Schema-parity test (packages/db/__tests__/unit/schema-parity.test.ts)
-- intentionally does NOT cover these tables — they're not part of the
-- 12-table dual-dialect contract.

CREATE TABLE "_migration_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"clerk_org_id" text NOT NULL,
	"source_machine" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_phase" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "_migration_map" (
	"attempt_id" text NOT NULL,
	"table_name" text NOT NULL,
	"old_id" text NOT NULL,
	"new_id" text NOT NULL,
	CONSTRAINT "_migration_map_attempt_id_table_name_old_id_pk" PRIMARY KEY("attempt_id","table_name","old_id"),
	CONSTRAINT "_migration_map_attempt_id__migration_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "_migration_attempts"("id") ON DELETE cascade ON UPDATE no action
);
