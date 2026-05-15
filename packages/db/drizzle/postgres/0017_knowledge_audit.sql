-- Phase F.3.c — knowledge_audit (2026-05-11). Postgres-only.
--
-- Append-only audit log of every knowledge-artifact mutation: who
-- did what to which feature / feature_pack, when. Cloud-only by
-- design — the local SQLite is per-developer and doesn't need
-- audit history (audits are a team-mode concern; solo mode has no
-- one to audit). Same rationale as _migration_attempts in
-- migration 0013.
--
-- Schema (mirrors knowledge-layer events):
--   - id              uuid PK
--   - org_id          text NOT NULL   — Clerk org id (data partition)
--   - resource_type   'feature' | 'feature_pack' (CHECK)
--   - resource_id     text NOT NULL   — slug or DB id
--   - action          'create' | 'update' | 'publish' | 'unpublish' | 'delete' (CHECK)
--   - actor_user_id   text NOT NULL   — Clerk user id of the mutator
--   - before_checksum text            — null on create
--   - after_checksum  text            — null on delete / unpublish
--   - created_at      timestamp NOT NULL DEFAULT now()
--
-- Indexes:
--   - (org_id, resource_type, resource_id, created_at DESC) — admin
--     "what happened to this slug?" query.
--   - (org_id, created_at DESC) — admin "what mutated today?" query.
--
-- Append-only constraint (ADR-007): no UPDATE / DELETE permissions
-- on this table at the application layer. Future Phase F.4 ships a
-- web /audit page that reads from this view.

CREATE TABLE "knowledge_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"before_checksum" text,
	"after_checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_audit_resource_type_check" CHECK ("resource_type" IN ('feature', 'feature_pack')),
	CONSTRAINT "knowledge_audit_action_check" CHECK ("action" IN ('create', 'update', 'publish', 'unpublish', 'delete'))
);
--> statement-breakpoint
CREATE INDEX "knowledge_audit_resource_idx" ON "knowledge_audit" USING btree ("org_id","resource_type","resource_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "knowledge_audit_org_recent_idx" ON "knowledge_audit" USING btree ("org_id","created_at" DESC);
