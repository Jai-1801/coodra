import 'server-only';

/**
 * `apps/web-v2/lib/postgres-errors.ts` — shared Postgres error
 * pattern matchers.
 *
 * Why a dedicated module: Drizzle ORM wraps the underlying
 * `postgres-js` error in a new `Error` whose top-level `.message`
 * looks like `Failed query: SELECT …`. The original Postgres error
 * (`code: '42P01'`, `message: 'relation "team_invites" does not exist'`)
 * lives on `.cause`. We need to walk the cause chain in three places:
 *
 *   - `app/install/[token]/page.tsx` (renders schema_not_migrated card)
 *   - `app/api/install/[token]/route.ts` (returns 503 schema_not_migrated)
 *   - `app/settings/team/page.tsx` (renders top-of-page banner)
 *
 * Keeping the matcher central means every consumer sees consistent
 * behavior — adding a new wrapper layer in drizzle/postgres only
 * requires updating this one file.
 */

/**
 * True iff the error (or any error in its `cause` chain) corresponds
 * to a `42P01 — relation "team_invites" does not exist` from Postgres.
 *
 * Two signals checked in priority order:
 *   1. Postgres SQLSTATE `42P01` on `.code` — most reliable.
 *   2. Regex match against `.message` — fallback when the error has
 *      been re-thrown without the code property preserved.
 */
export function isMissingTeamInvitesTableError(err: unknown): boolean {
  const pattern = /relation\s+"?team_invites"?\s+does not exist/i;
  for (let cur: unknown = err; cur !== null && cur !== undefined; ) {
    if (cur instanceof Error) {
      if ('code' in cur && (cur as { code?: unknown }).code === '42P01') return true;
      if (pattern.test(cur.message)) return true;
      cur = (cur as { cause?: unknown }).cause;
    } else {
      return false;
    }
  }
  return false;
}
