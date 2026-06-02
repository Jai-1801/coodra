import { type DbHandle, postgresSchema, sqliteSchema } from '@coodra/db';
import { createLogger } from '@coodra/shared';
import { desc, eq } from 'drizzle-orm';
import type { ToolContext } from '../../framework/tool-context.js';
import type { PrepareJiraCommentInput, PrepareJiraCommentOutput } from './schema.js';

/**
 * Handler factory for `coodra__prepare_jira_comment` (§24.4, Module 09
 * Track 9A, ADR-016 — the on-request Jira write-back helper).
 *
 * Read-only. Assembles a markdown comment body for a linked run from
 * Coodra's own records — the run's latest Context Pack (title + excerpt)
 * and its most-recent decisions. It performs **no writes** and makes **no
 * Jira API call**: it returns `{ issueRef, body }` which the agent passes
 * to Rovo's `addCommentToJiraIssue`, on the user's explicit request only.
 *
 * Flow:
 *   1. SELECT runs(id, issue_ref) for `input.runId`. Missing →
 *      `run_not_found` soft-failure. `issue_ref` null → `not_linked`.
 *   2. SELECT the run's latest context_pack (title / content / excerpt).
 *      May be null — a run with no pack yet is fine, the body is built
 *      from decisions alone.
 *   3. SELECT the top `maxDecisions` decisions for the run (most recent).
 *   4. Assemble the markdown body and return it.
 */

const handlerLogger = createLogger('mcp-server.tool.prepare_jira_comment');

export interface PrepareJiraCommentHandlerDeps {
  readonly db: DbHandle;
}

async function selectRun(
  db: DbHandle,
  runId: string,
): Promise<{ readonly id: string; readonly issueRef: string | null } | null> {
  if (db.kind === 'sqlite') {
    const rows = await db.db
      .select({ id: sqliteSchema.runs.id, issueRef: sqliteSchema.runs.issueRef })
      .from(sqliteSchema.runs)
      .where(eq(sqliteSchema.runs.id, runId))
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db.db
    .select({ id: postgresSchema.runs.id, issueRef: postgresSchema.runs.issueRef })
    .from(postgresSchema.runs)
    .where(eq(postgresSchema.runs.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

interface PackRow {
  readonly title: string;
  readonly content: string;
  readonly contentExcerpt: string;
}

async function selectLatestPack(db: DbHandle, runId: string): Promise<PackRow | null> {
  if (db.kind === 'sqlite') {
    const packs = sqliteSchema.contextPacks;
    const rows = await db.db
      .select({ title: packs.title, content: packs.content, contentExcerpt: packs.contentExcerpt })
      .from(packs)
      .where(eq(packs.runId, runId))
      .orderBy(desc(packs.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }
  const packs = postgresSchema.contextPacks;
  const rows = await db.db
    .select({ title: packs.title, content: packs.content, contentExcerpt: packs.contentExcerpt })
    .from(packs)
    .where(eq(packs.runId, runId))
    .orderBy(desc(packs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function selectTopDecisions(
  db: DbHandle,
  runId: string,
  limit: number,
): Promise<ReadonlyArray<{ description: string }>> {
  if (limit <= 0) return [];
  if (db.kind === 'sqlite') {
    const d = sqliteSchema.decisions;
    return await db.db
      .select({ description: d.description })
      .from(d)
      .where(eq(d.runId, runId))
      .orderBy(desc(d.createdAt))
      .limit(limit);
  }
  const d = postgresSchema.decisions;
  return await db.db
    .select({ description: d.description })
    .from(d)
    .where(eq(d.runId, runId))
    .orderBy(desc(d.createdAt))
    .limit(limit);
}

/** Truncate to `max` chars on a soft boundary with an ellipsis. */
function clamp(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

function assembleBody(opts: {
  readonly issueRef: string;
  readonly runId: string;
  readonly pack: PackRow | null;
  readonly decisions: ReadonlyArray<{ description: string }>;
}): string {
  const lines: string[] = [`**Coodra session summary — ${opts.issueRef}**`];

  if (opts.pack !== null && opts.pack.title.trim().length > 0) {
    lines.push('', `**${opts.pack.title.trim()}**`);
  }

  if (opts.pack !== null) {
    const source = opts.pack.contentExcerpt.trim().length > 0 ? opts.pack.contentExcerpt : opts.pack.content;
    const excerpt = clamp(source, 500);
    if (excerpt.length > 0) lines.push('', excerpt);
  }

  if (opts.decisions.length > 0) {
    lines.push('', '**Key decisions:**');
    for (const d of opts.decisions) {
      lines.push(`- ${clamp(d.description, 200)}`);
    }
  }

  lines.push('', `_Recorded by the Coodra agent for run \`${opts.runId}\`._`);
  return lines.join('\n');
}

export function createPrepareJiraCommentHandler(deps: PrepareJiraCommentHandlerDeps) {
  if (!deps || typeof deps !== 'object') {
    throw new TypeError('createPrepareJiraCommentHandler requires a deps object');
  }
  if (!deps.db || typeof deps.db !== 'object' || !('kind' in deps.db)) {
    throw new TypeError('createPrepareJiraCommentHandler: deps.db must be a DbHandle');
  }

  return async function prepareJiraCommentHandler(
    input: PrepareJiraCommentInput,
    ctx: ToolContext,
  ): Promise<PrepareJiraCommentOutput> {
    const run = await selectRun(deps.db, input.runId);
    if (run === null) {
      handlerLogger.info(
        { event: 'prepare_jira_comment_run_not_found', runId: input.runId, sessionId: ctx.sessionId },
        'prepare_jira_comment: runId does not match a runs row — returning soft-failure',
      );
      return {
        ok: false,
        error: 'run_not_found',
        howToFix:
          'Call get_run_id first to obtain a runId, then link it with link_run_to_issue before preparing a comment.',
      };
    }
    if (run.issueRef === null) {
      handlerLogger.info(
        { event: 'prepare_jira_comment_not_linked', runId: input.runId, sessionId: ctx.sessionId },
        'prepare_jira_comment: run has no issueRef — returning not_linked soft-failure',
      );
      return {
        ok: false,
        error: 'not_linked',
        howToFix:
          'This run is not bound to a Jira issue yet. Call link_run_to_issue { runId, issueRef } first, then retry.',
      };
    }

    const [pack, decisions] = await Promise.all([
      selectLatestPack(deps.db, input.runId),
      selectTopDecisions(deps.db, input.runId, input.maxDecisions),
    ]);

    const body = assembleBody({ issueRef: run.issueRef, runId: input.runId, pack, decisions });
    handlerLogger.info(
      {
        event: 'prepare_jira_comment_assembled',
        runId: input.runId,
        issueRef: run.issueRef,
        hasPack: pack !== null,
        decisionCount: decisions.length,
        bodyLength: body.length,
        sessionId: ctx.sessionId,
      },
      'prepare_jira_comment: assembled comment body (no Jira call — agent posts via Rovo)',
    );
    return { ok: true, issueRef: run.issueRef, body };
  };
}
