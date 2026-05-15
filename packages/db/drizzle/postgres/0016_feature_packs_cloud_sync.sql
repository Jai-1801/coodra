-- Phase F.2 — feature_packs cloud sync (2026-05-11) — postgres mirror.
-- See drizzle/sqlite/0015_feature_packs_cloud_sync.sql for the rationale.
--
-- The cloud-side row is the canonical distribution shape: a teammate's
-- sync-daemon SELECTs from this table on every tick, dedups by checksum,
-- and writes the four files into `<project>/docs/feature-packs/<slug>/`
-- on disk.

ALTER TABLE "feature_packs" ADD COLUMN "content_json" text;
--> statement-breakpoint
ALTER TABLE "feature_packs" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;
