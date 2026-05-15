import { describe, expect, it, vi } from 'vitest';

/**
 * Phase B (clarity-pass-plan, 2026-05-11) — clerk-bootstrap tests.
 *
 * The module hits the Clerk Backend SDK, so we mock `@clerk/backend`
 * at the module level. Tests cover:
 *   1. Plausible-key gate — sk_test_ / sk_live_ prefix required.
 *   2. Single-org happy path — returns selectedOrg auto-set.
 *   3. Multi-org without preferredOrgId — returns selectedOrg=null.
 *   4. Multi-org with matching preferredOrgId — auto-selects.
 *   5. Multi-org with non-matching preferredOrgId — org_not_found.
 *   6. Empty org membership list — no_orgs error code.
 *   7. Clerk API rejects with 401 → invalid_key classification.
 */

vi.mock('@clerk/backend', () => {
  const usersGetUserList = vi.fn();
  const usersGetOrganizationMembershipList = vi.fn();
  return {
    createClerkClient: vi.fn(() => ({
      users: { getUserList: usersGetUserList, getOrganizationMembershipList: usersGetOrganizationMembershipList },
    })),
    __mocks: { usersGetUserList, usersGetOrganizationMembershipList },
  };
});

async function getMocks() {
  const mod = (await import('@clerk/backend')) as unknown as {
    __mocks: {
      usersGetUserList: ReturnType<typeof vi.fn>;
      usersGetOrganizationMembershipList: ReturnType<typeof vi.fn>;
    };
  };
  return mod.__mocks;
}

async function freshBootstrap() {
  // Re-import the module under test fresh so vi.mock takes effect.
  return await import('../../../../src/lib/team-init/clerk-bootstrap.js');
}

describe('bootstrapClerk', () => {
  it('rejects a key without the sk_test_ / sk_live_ prefix', async () => {
    const { bootstrapClerk } = await freshBootstrap();
    const result = await bootstrapClerk({ secretKey: 'pk_test_oops' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_key');
  });

  it('single-org instance — auto-selects the only org', async () => {
    const mocks = await getMocks();
    mocks.usersGetUserList.mockResolvedValueOnce({
      data: [
        {
          id: 'user_a',
          emailAddresses: [{ id: 'em_1', emailAddress: 'alice@example.com' }],
          primaryEmailAddressId: 'em_1',
        },
      ],
    });
    mocks.usersGetOrganizationMembershipList.mockResolvedValueOnce({
      data: [{ role: 'org:admin', organization: { id: 'org_acme', slug: 'acme', name: 'Acme' } }],
    });
    const { bootstrapClerk } = await freshBootstrap();
    const result = await bootstrapClerk({ secretKey: 'sk_test_zzz' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe('user_a');
      expect(result.userEmail).toBe('alice@example.com');
      expect(result.orgs).toHaveLength(1);
      expect(result.selectedOrg?.id).toBe('org_acme');
    }
  });

  it('multi-org without preferredOrgId — selectedOrg is null', async () => {
    const mocks = await getMocks();
    mocks.usersGetUserList.mockResolvedValueOnce({
      data: [{ id: 'user_a', emailAddresses: [], primaryEmailAddressId: null }],
    });
    mocks.usersGetOrganizationMembershipList.mockResolvedValueOnce({
      data: [
        { role: 'org:admin', organization: { id: 'org_a', slug: 'a', name: 'A' } },
        { role: 'org:member', organization: { id: 'org_b', slug: null, name: 'B' } },
      ],
    });
    const { bootstrapClerk } = await freshBootstrap();
    const result = await bootstrapClerk({ secretKey: 'sk_live_yyy' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.orgs).toHaveLength(2);
      expect(result.selectedOrg).toBeNull();
    }
  });

  it('multi-org with non-matching preferredOrgId — org_not_found', async () => {
    const mocks = await getMocks();
    mocks.usersGetUserList.mockResolvedValueOnce({
      data: [{ id: 'user_a', emailAddresses: [], primaryEmailAddressId: null }],
    });
    mocks.usersGetOrganizationMembershipList.mockResolvedValueOnce({
      data: [{ role: null, organization: { id: 'org_a', slug: 'a', name: 'A' } }],
    });
    const { bootstrapClerk } = await freshBootstrap();
    const result = await bootstrapClerk({ secretKey: 'sk_test_xxx', preferredOrgId: 'org_NONEXISTENT' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('org_not_found');
  });

  it('empty org membership list → no_orgs', async () => {
    const mocks = await getMocks();
    mocks.usersGetUserList.mockResolvedValueOnce({
      data: [{ id: 'user_a', emailAddresses: [], primaryEmailAddressId: null }],
    });
    mocks.usersGetOrganizationMembershipList.mockResolvedValueOnce({ data: [] });
    const { bootstrapClerk } = await freshBootstrap();
    const result = await bootstrapClerk({ secretKey: 'sk_test_xxx' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_orgs');
  });

  it('Clerk 401 on getUserList → invalid_key classification', async () => {
    const mocks = await getMocks();
    mocks.usersGetUserList.mockRejectedValueOnce(new Error('Unauthorized: invalid API key'));
    const { bootstrapClerk } = await freshBootstrap();
    const result = await bootstrapClerk({ secretKey: 'sk_test_bad' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_key');
  });
});
