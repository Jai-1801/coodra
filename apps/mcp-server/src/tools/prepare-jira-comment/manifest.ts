import type { IdempotencyKeyBuilder } from '../../framework/idempotency.js';
import type { ToolRegistration } from '../../framework/tool-registry.js';

import { createPrepareJiraCommentHandler, type PrepareJiraCommentHandlerDeps } from './handler.js';
import {
  type PrepareJiraCommentInput,
  prepareJiraCommentInputSchema,
  prepareJiraCommentOutputSchema,
} from './schema.js';

/**
 * Registration factory for `coodra__prepare_jira_comment` (Module 09 Track
 * 9A, ADR-016 — the on-request Jira write-back helper). Factory-shaped
 * because the handler closes over the process's boot-time `DbHandle`.
 *
 * Read-only: it assembles a comment body from Coodra's own records (the
 * run's Context Pack + decisions) and returns it. It does NOT post to Jira
 * — the agent passes the body to Rovo's `addCommentToJiraIssue`, on the
 * user's explicit request only. Keeping the assembly in Coodra (rather than
 * making the agent re-derive it) is the whole point: one call yields a
 * consistent, sourced summary.
 *
 * The §24.3 description-anatomy assertion in
 * `@coodra/shared/test-utils::assertManifestDescriptionValid` is the CI
 * guard for the string below.
 */

const prepareJiraCommentIdempotencyKey: IdempotencyKeyBuilder<PrepareJiraCommentInput> = (input, _ctx) => {
  // Read-only: assembles from append-only records, so the same (runId,
  // maxDecisions) yields the same body at a given point in time.
  const runId = typeof input?.runId === 'string' && input.runId.length > 0 ? input.runId : 'unknown';
  const max = typeof input?.maxDecisions === 'number' ? input.maxDecisions : 3;
  return {
    kind: 'readonly',
    key: `prepare_jira_comment:${runId}:${max}`.slice(0, 200),
  };
};

export function createPrepareJiraCommentToolRegistration(
  deps: PrepareJiraCommentHandlerDeps,
): ToolRegistration<typeof prepareJiraCommentInputSchema, typeof prepareJiraCommentOutputSchema> {
  return {
    name: 'prepare_jira_comment',
    title: 'Coodra: prepare_jira_comment',
    description:
      'Call this ONLY when the user asks to post the session summary to the linked Jira issue. Assembles a markdown ' +
      "comment from the run's Context Pack (title + excerpt) and its top decisions — the run must already be linked " +
      'via link_run_to_issue. Posts nothing and records nothing. Returns { ok: true, issueRef, body } to hand to ' +
      "Rovo's addCommentToJiraIssue { issueIdOrKey: issueRef, body }, or { ok: false, error: 'run_not_found' | " +
      "'not_linked', howToFix }. Never post to Jira unprompted — wait for the user to ask.",
    inputSchema: prepareJiraCommentInputSchema,
    outputSchema: prepareJiraCommentOutputSchema,
    idempotencyKey: prepareJiraCommentIdempotencyKey,
    handler: createPrepareJiraCommentHandler(deps),
  };
}
