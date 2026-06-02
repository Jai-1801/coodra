import { z } from 'zod';

/**
 * Input schema for `coodra__prepare_jira_comment` (§24.4, Module 09 Track
 * 9A, ADR-016 — Jira = Direct, the on-request write-back helper).
 *
 * Assembles a markdown comment body for a run that is already bound to a
 * Jira issue (via `link_run_to_issue`), from Coodra's own records — the
 * run's Context Pack (title + excerpt) and its top decisions. The tool
 * **posts nothing**: it returns the `{ issueRef, body }` the agent then
 * passes to Rovo's `addCommentToJiraIssue { issueIdOrKey, body }`, on the
 * user's explicit request only. This keeps the boundary clean — Coodra
 * assembles from its records, Atlassian's MCP does the write.
 */
export const prepareJiraCommentInputSchema = z
  .object({
    runId: z
      .string()
      .min(1, 'runId is required')
      .max(256, 'runId must be at most 256 characters')
      .describe('The runId whose session summary to assemble. The run must already be linked (link_run_to_issue).'),
    maxDecisions: z
      .number()
      .int()
      .min(0, 'maxDecisions must be >= 0')
      .max(10, 'maxDecisions must be <= 10')
      .default(3)
      .describe('How many of the most recent decisions to include in the summary (default 3).'),
  })
  .strict()
  .describe('Input for coodra__prepare_jira_comment.');

/**
 * Output schema — a `z.union` of success + two soft-failure branches (a
 * `z.discriminatedUnion` on `ok` is not usable here: it requires unique
 * discriminator values, and BOTH soft-failures carry `ok: false`). The
 * branches are distinguished by their `error` literal. Canonical
 * soft-failure shape per §9.1.2.
 *
 * Success returns the bound issue key + the assembled markdown body. Two
 * soft-failures: `run_not_found` (unknown runId) and `not_linked` (the run
 * has no `issueRef` — the agent should call `link_run_to_issue` first).
 * A run with no Context Pack yet is NOT a failure — the body is assembled
 * from decisions alone with a generic title.
 */
const prepareJiraCommentSuccess = z
  .object({
    ok: z.literal(true),
    issueRef: z.string().min(1).describe('The Jira key the run is bound to (the comment target).'),
    body: z.string().min(1).describe('Markdown comment body to pass to Rovo addCommentToJiraIssue.'),
  })
  .strict();

const prepareJiraCommentRunNotFound = z
  .object({
    ok: z.literal(false),
    error: z.literal('run_not_found'),
    howToFix: z.string().min(1),
  })
  .strict();

const prepareJiraCommentNotLinked = z
  .object({
    ok: z.literal(false),
    error: z.literal('not_linked'),
    howToFix: z.string().min(1).describe('The run has no Jira issue — call link_run_to_issue first.'),
  })
  .strict();

export const prepareJiraCommentOutputSchema = z.union([
  prepareJiraCommentSuccess,
  prepareJiraCommentRunNotFound,
  prepareJiraCommentNotLinked,
]);

export type PrepareJiraCommentInput = z.infer<typeof prepareJiraCommentInputSchema>;
export type PrepareJiraCommentOutput = z.infer<typeof prepareJiraCommentOutputSchema>;
