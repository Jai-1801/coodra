import { z } from 'zod';

/**
 * Module 06 — Run Diff. Shared Zod schemas + constants used by the
 * hooks-bridge runner, the MCP `query_run_diff` tool, the auto-context-
 * pack consumer, and the web-v2 diff page.
 *
 * The DB row in `run_diffs` stores `files_changed` as a JSON-encoded
 * text column (parity with SQLite); `runDiffFilesChangedSchema` is the
 * canonical shape for the parsed array. The MCP tool's output schema
 * composes this with a discriminated union for the soft-failure shape.
 */

/**
 * Hard cap for the unified-diff text we keep in `run_diffs.unified_diff`.
 * 256 KiB is enough for any reasonable session diff (median real session
 * touches a few hundred lines; a runaway 5000-line generation still fits
 * easily). Beyond this we truncate at a clean newline and set
 * `truncated = true`. The cap is shared between the bridge runner and
 * the MCP tool so a future tool that can return more bytes doesn't
 * silently disagree with the storage cap.
 */
export const MAX_UNIFIED_DIFF_BYTES = 256 * 1024;

/**
 * Hard cap for the number of distinct files we'll diff in a single run.
 * `git diff -- <pathspec>...` slows linearly in argv length on huge runs;
 * if an agent edited > MAX_FILES_PER_DIFF distinct paths, we keep the
 * top-N most-recently-edited and surface the rest as a metadata note.
 */
export const MAX_FILES_PER_DIFF = 200;

/**
 * Status shape from `git diff --name-status` — A / M / D / R / C / T are
 * the operations we actually emit. We normalize to the verbose strings
 * for the JSON shape so consumers don't need to learn the letter codes.
 */
export const runDiffFileStatusSchema = z.enum(['added', 'modified', 'deleted', 'renamed', 'copied', 'type_changed']);
export type RunDiffFileStatus = z.infer<typeof runDiffFileStatusSchema>;

export const runDiffFileEntrySchema = z
  .object({
    path: z.string().min(1),
    /**
     * For renames / copies, the original path. Missing for added /
     * modified / deleted.
     */
    oldPath: z.string().min(1).optional(),
    status: runDiffFileStatusSchema,
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  })
  .strict();
export type RunDiffFileEntry = z.infer<typeof runDiffFileEntrySchema>;

export const runDiffFilesChangedSchema = z.array(runDiffFileEntrySchema);

/**
 * The set of stable error codes a run_diffs row can carry. Tools and UI
 * branch on these, not on the raw string. A new code MUST be added here
 * before the bridge runner emits it (and a new MCP-tool soft-failure
 * branch added in the same change).
 */
export const runDiffErrorCodeSchema = z.enum(['no_base_sha', 'no_edits_in_run', 'git_diff_failed']);
export type RunDiffErrorCode = z.infer<typeof runDiffErrorCodeSchema>;

/**
 * Parse a JSON-encoded `files_changed` column into the typed array.
 * Returns `[]` on parse failure or schema mismatch — a malformed
 * column value is treated the same as "no files" so consumers don't
 * crash. Callers that care about the distinction should log when this
 * returns empty unexpectedly.
 */
export function parseRunDiffFilesChanged(raw: string | null | undefined): RunDiffFileEntry[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const result = runDiffFilesChangedSchema.safeParse(parsed);
  if (!result.success) return [];
  return result.data;
}

/**
 * Truncate a unified-diff text at a clean newline boundary so the
 * truncated marker doesn't land mid-line. Returns `{ text, truncated }`.
 * If the input is already under the cap, returns it unchanged with
 * `truncated: false`.
 */
export function truncateUnifiedDiff(
  diff: string,
  maxBytes: number = MAX_UNIFIED_DIFF_BYTES,
): {
  text: string;
  truncated: boolean;
} {
  if (Buffer.byteLength(diff, 'utf8') <= maxBytes) {
    return { text: diff, truncated: false };
  }
  // Walk back from the byte cap to the previous newline so the truncation
  // produces a parseable diff fragment.
  const buf = Buffer.from(diff, 'utf8');
  let cut = buf.subarray(0, maxBytes);
  const lastNewline = cut.lastIndexOf(0x0a /* \n */);
  if (lastNewline > 0) cut = cut.subarray(0, lastNewline + 1);
  return { text: cut.toString('utf8'), truncated: true };
}
