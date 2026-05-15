-- 0018_feature_packs_org_id.sql — Phase G slice G.9 (2026-05-12).
--
-- Multi-tenancy hardening: explicit org_id on feature_packs for
-- cloud-side org-scoped filtering. Without this, a feature_packs row
-- minted by org A could be served to a user in org B (table was
-- keyed by slug only).
--
-- Phase G strategy — nullable column + partial unique index. Existing
-- rows stay org_id=NULL, treated as `__legacy__` at read time.
-- Phase G+1 / H backfills NULL → '__legacy__', drops the legacy
-- UNIQUE(slug), and replaces it with strict UNIQUE(org_id, slug).

ALTER TABLE "feature_packs" ADD COLUMN "org_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "feature_packs_org_slug_uk" ON "feature_packs" ("org_id","slug") WHERE "org_id" IS NOT NULL;
