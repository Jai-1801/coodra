-- Module 04 Phase 2 — `team_invites` (2026-05-11).
--
-- One row per teammate invitation an admin mints from /settings/team
-- in `team-hosted` mode. See `packages/db/src/schema/postgres.ts::teamInvites`
-- and the SQLite mirror (`drizzle/sqlite/0013_team_invites.sql`) for
-- the full design rationale.
--
-- Redemption path (`POST /api/install/[token]`):
--   UPDATE team_invites
--     SET used_at = now(), used_by_user_id = $1
--     WHERE jti = $2 AND used_at IS NULL AND revoked_at IS NULL
--   RETURNING *;
-- The CONDITIONAL UPDATE + UNIQUE(jti) guarantees exactly-once redemption
-- under concurrent CLI calls.

CREATE TABLE "team_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"jti" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"clerk_invitation_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invites_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE INDEX "team_invites_org_active_idx" ON "team_invites" USING btree ("org_id","used_at","revoked_at");--> statement-breakpoint
CREATE INDEX "team_invites_email_idx" ON "team_invites" USING btree ("email");
