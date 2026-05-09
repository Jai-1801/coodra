import { type PostgresHandle, postgresSchema, type SqliteHandle, sqliteSchema } from '@coodra/contextos-db';
import { createLogger, type Logger } from '@coodra/contextos-shared';
import { gt, sql } from 'drizzle-orm';

/**
 * `apps/sync-daemon/src/lib/team-rows-puller.ts` — Module 04 Phase 4.
 *
 * Cloud → local poller for the append-only tables that need to be
 * visible to local consumers (M05 recent-decisions injection, the
 * MCP `query_decisions` tool, the auto-context-pack diff section).
 *
 * Three tables on the same pattern:
 *   - `decisions`     — newer-than-local-max(created_at) wins.
 *   - `context_packs` — newer-than-local-max(created_at) wins.
 *   - `run_events`    — newer-than-local-max(created_at) wins.
 *
 * Each table is append-only (ADR-007), so the pull is conflict-free:
 * INSERT ON CONFLICT (id) DO NOTHING. Upserts that mutate fields are
 * not possible here (the source rows never change after insert).
 *
 * Caveat — when a team-mate writes a decision and the decision's run_id
 * references a runs row not yet pulled locally, the FK lookup
 * (`run_id` references `runs(id)`) silently fails because `runs.run_id`
 * is `ON DELETE SET NULL` and not enforced on insert. For v1 we accept
 * this — the local consumer's `query_decisions` tool will see the row
 * with `runId=null` until the runs row arrives on a subsequent tick.
 * Future tightening: order pull-table sequence so `runs` arrives
 * first, then dependents.
 *
 * Caveat — these helpers do NOT yet scope by org. They pull every row
 * from cloud whose timestamp is newer than the local high-water-mark.
 * In the team-cloud architecture each developer's local SQLite is
 * scoped to their active org by `projects.org_id` FK chain, but cloud
 * rows for OTHER orgs the developer is a member of would also flow
 * in here. v1 assumes one active org per machine; multi-org scope is a
 * follow-on (multi-org context switch needs design work in M04 too).
 */

const PULL_CHUNK_SIZE = 500;

/**
 * `sql\`MAX(${col})\`` over an `integer({ mode: 'timestamp' })` column
 * bypasses Drizzle's column-mode decoder and returns the raw stored
 * value (Unix seconds as `number`) rather than a `Date`. Passing a
 * `number` to `gt(pgTimestampCol, value)` then crashes postgres-js
 * with `value.toISOString is not a function`. Decode here.
 */
function decodeSqliteMaxTimestamp(raw: unknown): Date {
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw * 1000);
  if (raw instanceof Date) return raw;
  return new Date(0);
}

export interface TeamRowsPullerDeps {
  readonly localDb: SqliteHandle;
  readonly cloudDb: PostgresHandle;
  readonly intervalMs?: number;
  readonly logger?: Logger;
}

export interface TeamRowsPullerHandle {
  readonly stop: () => Promise<void>;
  readonly tickOnce: () => Promise<TeamRowsPullSummary>;
}

export interface TeamRowsPullSummary {
  readonly decisions: number;
  readonly contextPacks: number;
  readonly runEvents: number;
  readonly runs: number;
}

const ZERO_SUMMARY: TeamRowsPullSummary = Object.freeze({
  decisions: 0,
  contextPacks: 0,
  runEvents: 0,
  runs: 0,
});

export function createTeamRowsPuller(deps: TeamRowsPullerDeps): TeamRowsPullerHandle {
  if (deps.localDb.kind !== 'sqlite') {
    throw new TypeError('createTeamRowsPuller: localDb must be a SqliteHandle');
  }
  if (deps.cloudDb.kind !== 'postgres') {
    throw new TypeError('createTeamRowsPuller: cloudDb must be a PostgresHandle');
  }
  const log = deps.logger ?? createLogger('sync-daemon.team-rows-puller');
  const intervalMs = deps.intervalMs ?? 10_000;
  const localDb = deps.localDb;
  const cloudDb = deps.cloudDb;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  /**
   * Pull `runs` first because `decisions`, `context_packs`, and
   * `run_events` all FK to `runs.id`. ON CONFLICT DO NOTHING handles
   * the case where the runs row already exists locally (a teammate's
   * runs row that we created on this machine — impossible since runs
   * are per-machine — or our own runs row already inserted via the
   * audit outbox); the dependent inserts that follow find the row.
   */
  async function pullRuns(): Promise<number> {
    const lt = sqliteSchema.runs;
    const ct = postgresSchema.runs;
    const maxRow = (await localDb.db.select({ maxStartedAt: sql<number | null>`MAX(${lt.startedAt})` }).from(lt))[0];
    const since = decodeSqliteMaxTimestamp(maxRow?.maxStartedAt ?? null);
    let cloudRows: Array<typeof ct.$inferSelect>;
    try {
      cloudRows = await cloudDb.db.select().from(ct).where(gt(ct.startedAt, since)).limit(PULL_CHUNK_SIZE);
    } catch (err) {
      log.warn(
        { event: 'team_rows_runs_pull_failed', err: err instanceof Error ? err.message : String(err) },
        'cloud SELECT runs threw — will retry next tick',
      );
      return 0;
    }
    if (cloudRows.length === 0) return 0;
    let inserted = 0;
    for (const row of cloudRows) {
      try {
        const stmt = localDb.raw.prepare(`
          INSERT INTO runs
            (id, project_id, session_id, agent_type, mode, status,
             issue_ref, pr_ref, base_sha, created_by_user_id, started_at, ended_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `);
        const r = stmt.run(
          row.id,
          row.projectId,
          row.sessionId,
          row.agentType,
          row.mode,
          row.status,
          row.issueRef,
          row.prRef,
          row.baseSha,
          row.createdByUserId,
          Math.floor(row.startedAt.getTime() / 1000),
          row.endedAt === null ? null : Math.floor(row.endedAt.getTime() / 1000),
        );
        if (r.changes > 0) inserted += 1;
      } catch (err) {
        log.warn(
          {
            event: 'team_rows_runs_insert_failed',
            runId: row.id,
            err: err instanceof Error ? err.message : String(err),
          },
          'local runs insert threw — will re-pull next tick',
        );
      }
    }
    return inserted;
  }

  async function pullDecisions(): Promise<number> {
    const lt = sqliteSchema.decisions;
    const ct = postgresSchema.decisions;
    const maxRow = (await localDb.db.select({ maxCreatedAt: sql<number | null>`MAX(${lt.createdAt})` }).from(lt))[0];
    const since = decodeSqliteMaxTimestamp(maxRow?.maxCreatedAt ?? null);
    let cloudRows: Array<typeof ct.$inferSelect>;
    try {
      cloudRows = await cloudDb.db.select().from(ct).where(gt(ct.createdAt, since)).limit(PULL_CHUNK_SIZE);
    } catch (err) {
      log.warn(
        { event: 'team_rows_decisions_pull_failed', err: err instanceof Error ? err.message : String(err) },
        'cloud SELECT decisions threw — will retry next tick',
      );
      return 0;
    }
    if (cloudRows.length === 0) return 0;
    let inserted = 0;
    for (const row of cloudRows) {
      try {
        const stmt = localDb.raw.prepare(`
          INSERT INTO decisions
            (id, idempotency_key, run_id, description, rationale, alternatives,
             context, impact, confidence, reversible, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(idempotency_key) DO NOTHING
        `);
        const r = stmt.run(
          row.id,
          row.idempotencyKey,
          row.runId,
          row.description,
          row.rationale,
          row.alternatives,
          row.context,
          row.impact,
          row.confidence,
          row.reversible === null ? null : row.reversible ? 1 : 0,
          row.createdByUserId,
          Math.floor(row.createdAt.getTime() / 1000),
        );
        if (r.changes > 0) inserted += 1;
      } catch (err) {
        log.warn(
          {
            event: 'team_rows_decisions_insert_failed',
            decisionId: row.id,
            err: err instanceof Error ? err.message : String(err),
          },
          'local decisions insert threw — will re-pull next tick',
        );
      }
    }
    return inserted;
  }

  async function pullContextPacks(): Promise<number> {
    const lt = sqliteSchema.contextPacks;
    const ct = postgresSchema.contextPacks;
    const maxRow = (await localDb.db.select({ maxCreatedAt: sql<number | null>`MAX(${lt.createdAt})` }).from(lt))[0];
    const since = decodeSqliteMaxTimestamp(maxRow?.maxCreatedAt ?? null);
    let cloudRows: Array<typeof ct.$inferSelect>;
    try {
      cloudRows = await cloudDb.db.select().from(ct).where(gt(ct.createdAt, since)).limit(PULL_CHUNK_SIZE);
    } catch (err) {
      log.warn(
        { event: 'team_rows_context_packs_pull_failed', err: err instanceof Error ? err.message : String(err) },
        'cloud SELECT context_packs threw — will retry next tick',
      );
      return 0;
    }
    if (cloudRows.length === 0) return 0;
    let inserted = 0;
    for (const row of cloudRows) {
      try {
        const stmt = localDb.raw.prepare(`
          INSERT INTO context_packs
            (id, run_id, project_id, title, content, content_excerpt,
             source, meta, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO NOTHING
        `);
        const r = stmt.run(
          row.id,
          row.runId,
          row.projectId,
          row.title,
          row.content,
          row.contentExcerpt,
          row.source,
          row.meta,
          row.createdByUserId,
          Math.floor(row.createdAt.getTime() / 1000),
        );
        if (r.changes > 0) inserted += 1;
      } catch (err) {
        log.warn(
          {
            event: 'team_rows_context_packs_insert_failed',
            contextPackId: row.id,
            err: err instanceof Error ? err.message : String(err),
          },
          'local context_packs insert threw — will re-pull next tick',
        );
      }
    }
    return inserted;
  }

  async function pullRunEvents(): Promise<number> {
    const lt = sqliteSchema.runEvents;
    const ct = postgresSchema.runEvents;
    const maxRow = (await localDb.db.select({ maxCreatedAt: sql<number | null>`MAX(${lt.createdAt})` }).from(lt))[0];
    const since = decodeSqliteMaxTimestamp(maxRow?.maxCreatedAt ?? null);
    let cloudRows: Array<typeof ct.$inferSelect>;
    try {
      cloudRows = await cloudDb.db.select().from(ct).where(gt(ct.createdAt, since)).limit(PULL_CHUNK_SIZE);
    } catch (err) {
      log.warn(
        { event: 'team_rows_run_events_pull_failed', err: err instanceof Error ? err.message : String(err) },
        'cloud SELECT run_events threw — will retry next tick',
      );
      return 0;
    }
    if (cloudRows.length === 0) return 0;
    let inserted = 0;
    for (const row of cloudRows) {
      try {
        const stmt = localDb.raw.prepare(`
          INSERT INTO run_events
            (id, run_id, phase, tool_name, tool_use_id, tool_input, outcome, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `);
        const r = stmt.run(
          row.id,
          row.runId,
          row.phase,
          row.toolName,
          row.toolUseId,
          row.toolInput,
          row.outcome,
          Math.floor(row.createdAt.getTime() / 1000),
        );
        if (r.changes > 0) inserted += 1;
      } catch (err) {
        log.warn(
          {
            event: 'team_rows_run_events_insert_failed',
            eventId: row.id,
            err: err instanceof Error ? err.message : String(err),
          },
          'local run_events insert threw — will re-pull next tick',
        );
      }
    }
    return inserted;
  }

  async function tickOnce(): Promise<TeamRowsPullSummary> {
    // Order matters — runs first (dependents reference it), then the
    // three append-only dependent tables. ON CONFLICT DO NOTHING keeps
    // the loop idempotent even when a race re-inserts.
    const runs = await pullRuns();
    const [decisions, contextPacks, runEvents] = await Promise.all([
      pullDecisions(),
      pullContextPacks(),
      pullRunEvents(),
    ]);
    const summary: TeamRowsPullSummary = { runs, decisions, contextPacks, runEvents };
    if (runs + decisions + contextPacks + runEvents > 0) {
      log.info({ event: 'team_rows_pulled', ...summary }, 'team-rows pull tick complete');
    }
    return summary;
  }

  function scheduleNext(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void tickOnce()
        .catch((err) => {
          log.warn(
            { event: 'team_rows_tick_threw', err: err instanceof Error ? err.message : String(err) },
            'tickOnce threw — will retry next interval',
          );
        })
        .finally(() => scheduleNext());
    }, intervalMs);
  }

  // Initial tick fires immediately.
  void tickOnce()
    .catch((err) => {
      log.warn(
        { event: 'team_rows_initial_tick_threw', err: err instanceof Error ? err.message : String(err) },
        'initial tickOnce threw',
      );
    })
    .finally(() => scheduleNext());

  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
    tickOnce,
  };
}

export const ZERO_PULL_SUMMARY = ZERO_SUMMARY;
