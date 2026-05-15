import 'server-only';

/**
 * `apps/web-v2/lib/clerk-env.ts` — quick boolean: is this deployment
 * running against a Clerk **development instance** (test keys)?
 *
 * Clerk's policy on test vs live keys (verified 2026-05-11 via
 * `GET /v1/instance` → `environment_type: development`):
 *   - `sk_test_…` / `pk_test_…` — development instance. Clerk does NOT
 *     deliver real emails to arbitrary recipients on this tier.
 *     Invitations are created server-side and visible in the Clerk
 *     dashboard, but the recipient does not receive an email. Real
 *     accounts that already exist in the instance still work; new
 *     invitations effectively require manual sharing of the redeem
 *     URL or admin acceptance via the dashboard.
 *   - `sk_live_…` / `pk_live_…` — production instance. Real emails
 *     are delivered.
 *
 * This is documented Clerk behavior (https://clerk.com/docs/deployments/overview)
 * but easy to miss for an admin who deploys against test keys for a
 * staging/demo environment and wonders why teammates never receive
 * invites.
 *
 * Use this helper to surface a **dev-mode banner** on /settings/team
 * so the admin sees the gap explicitly the first time they generate
 * an invite. The banner directs them to either (a) share the link
 * directly, or (b) switch to production keys, or (c) accept the
 * invitation in the Clerk dashboard.
 */
export function isClerkDevelopmentInstance(): boolean {
  const sk = process.env.CLERK_SECRET_KEY;
  if (typeof sk !== 'string' || sk.length === 0) return false;
  // The `sk_test_…` prefix is the canonical signal. Clerk has never
  // changed this — every doc + every Clerk SDK uses the same prefix
  // convention. We also accept the `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  // as a tiebreaker because a misconfigured deploy may have mixed
  // test/live keys.
  if (sk.startsWith('sk_test_')) return true;
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (typeof pk === 'string' && pk.startsWith('pk_test_')) return true;
  return false;
}
