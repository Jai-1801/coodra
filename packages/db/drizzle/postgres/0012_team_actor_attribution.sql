-- Module 04 Phase 4 — Team Actor Attribution (2026-05-09) — postgres mirror.
-- See drizzle/sqlite/0012_team_actor_attribution.sql for the design rationale.

ALTER TABLE "runs" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "context_packs" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "feature_packs" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "kill_switches" ADD COLUMN "paused_by_user_id" text;--> statement-breakpoint
ALTER TABLE "kill_switches" ADD COLUMN "resumed_by_user_id" text;
