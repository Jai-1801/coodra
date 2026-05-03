-- Slice 7 (2026-05-03 audit §14.2) — UNIQUE constraint on policy_rules.
-- See drizzle/sqlite/0006_clumsy_banshee.sql for the full rationale.
--
-- Postgres mirror of the SQLite migration. Pre-cleanup uses a CTE
-- because Postgres's GROUP BY ... DELETE pattern requires a different
-- shape than SQLite's. Same end state: at most one row per
-- (policy_id, priority, match_event_type, match_tool_name, match_path_glob)
-- tuple, then a UNIQUE INDEX backstop.

-- @preserve-begin hand-written:policy-rules-dedup-cleanup-postgres
-- Block owner: Slice 7 (2026-05-03 audit §14.2). Pre-cleanup before the
-- UNIQUE INDEX. Drizzle-Kit does NOT emit this; sha256 of this block is
-- locked in `packages/db/migrations.lock.json`. If drizzle-kit regenerates
-- this migration and wipes this block, restore from git and re-run
-- `pnpm --filter @coodra/contextos-db check:migration-lock --write`.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY policy_id, priority, match_event_type, match_tool_name, match_path_glob
           ORDER BY id ASC
         ) AS rn
  FROM policy_rules
)
DELETE FROM policy_rules WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
-- @preserve-end hand-written:policy-rules-dedup-cleanup-postgres
--> statement-breakpoint
CREATE UNIQUE INDEX "policy_rules_dedup_uk" ON "policy_rules" USING btree ("policy_id","priority","match_event_type","match_tool_name","match_path_glob");
