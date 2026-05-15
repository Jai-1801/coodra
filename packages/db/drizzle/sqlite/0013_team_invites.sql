-- Module 04 Phase 2 — `team_invites` (2026-05-11).
--
-- One row per teammate invitation an admin mints from /settings/team
-- in `team-hosted` mode. See `packages/db/src/schema/sqlite.ts::teamInvites`
-- for the full design rationale.
--
-- Dual-dialect parity: this table exists on both SQLite and Postgres
-- though only the cloud Postgres ever holds rows in practice. The
-- schema-parity test enforces structural identity; keeping the dialect
-- shapes identical avoids retrofit pain if local invite drafts are ever
-- introduced.

CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`jti` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`clerk_invitation_id` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by_user_id` text,
	`revoked_at` integer,
	`revoked_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_jti_unique` ON `team_invites` (`jti`);--> statement-breakpoint
CREATE INDEX `team_invites_org_active_idx` ON `team_invites` (`org_id`,`used_at`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `team_invites_email_idx` ON `team_invites` (`email`);
