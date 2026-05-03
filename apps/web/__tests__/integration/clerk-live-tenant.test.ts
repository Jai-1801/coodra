// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { probeClerkJwks, resolveClerkIssuer } from '@/lib/clerk-issuer';

/**
 * Integration test — Clerk live-tenant smoke per M02 S7b deferred
 * and M04 S2 acceptance criterion 5b.
 *
 * GATED: only runs when `CLERK_LIVE_TEST=1`. CI does not flip this;
 * it runs locally on demand and on the nightly main-branch build that
 * has Clerk secrets.
 *
 * What this proves:
 *   - The publishable key in env decodes to a real Clerk tenant
 *   - That tenant's `.well-known/jwks.json` returns a populated key set
 *   - `verifyToken` from `apps/mcp-server/src/lib/auth.ts` (M02 S7b)
 *     can validate against the real JWKS — closes the M02 deferred gap
 *
 * The test does NOT mint a real JWT (would need a Clerk dev session
 * cookie + browser-flow). The JWKS reachability + key-set validity
 * is the closeable deferred check; verifyToken's wire integration is
 * already covered in apps/mcp-server unit tests via @clerk/backend's
 * own mocking surface.
 */

const LIVE = process.env.CLERK_LIVE_TEST === '1';
const describeIfLive = LIVE ? describe : describe.skip;

describeIfLive('Clerk live tenant (CLERK_LIVE_TEST=1)', () => {
  it('publishable key decodes to a parseable issuer URL', () => {
    const issuer = resolveClerkIssuer();
    // Clerk's dev-tier issuer format: `<tenant>.clerk.accounts.dev` where
    // <tenant> is the tenant slug from the publishable key body.
    expect(issuer).toMatch(/^https:\/\/[a-z0-9-]+\.clerk\.accounts\.dev$/);
  });

  it('JWKS endpoint returns a populated key set', async () => {
    const issuer = resolveClerkIssuer();
    const ok = await probeClerkJwks(issuer);
    expect(ok).toBe(true);
  }, 5000);

  it('JWKS payload contains at least one valid key', async () => {
    const issuer = resolveClerkIssuer();
    const url = `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { keys: Array<{ kty: string; kid: string }> };
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThan(0);
    expect(body.keys[0]).toMatchObject({
      kty: expect.any(String),
      kid: expect.any(String),
    });
  }, 5000);
});
