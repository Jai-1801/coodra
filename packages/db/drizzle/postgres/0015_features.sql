-- Phase F.1 — features (2026-05-11) — postgres mirror.
-- See drizzle/sqlite/0014_features.sql for the full design rationale.
--
-- Pull-on-trigger skill recipes. Cloud Postgres is the team-mode
-- distribution channel; the sync-daemon pushes local file changes here
-- and pulls rows back to teammate filesystems. Status lifecycle
-- (draft → published) gates visibility to the MCP `list_features`
-- handler (which filters status='published').
--
-- ON CONFLICT (project_id, slug) DO UPDATE is the sync-daemon's
-- write pattern — same slug from the same project is an idempotent
-- update, not a duplicate.

CREATE TABLE "features" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"slug" text NOT NULL,
	"frontmatter" text NOT NULL,
	"body" text NOT NULL,
	"checksum" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "features_project_slug_uk" UNIQUE("project_id","slug")
);
--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "features_project_status_idx" ON "features" USING btree ("project_id","status");
