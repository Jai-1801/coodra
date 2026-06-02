import { notFound } from 'next/navigation';

import { AuthShell } from '@/components/AuthShell';
import { clerkAuthAppearance } from '@/lib/clerk-appearance';
import { resolveIdentityMode } from '@/lib/deployment-mode';

export const dynamic = 'force-dynamic';

/**
 * `/auth/sign-up/[[...sign-up]]` — Clerk's catch-all sign-up route.
 *
 * Phase G — renders in any TEAM mode (laptop or cloud). Solo mode returns
 * 404 (no Clerk).
 *
 * In Phase 2 (invite tokens), new teammates land here via the
 * `/install/<token>` page after clicking their invitation email. Admin
 * should configure Clerk to require invitation (Clerk dashboard →
 * Authentication → Restrictions) to prevent randos from joining the
 * deployment's Clerk app.
 *
 * UI: Clerk's `<SignUp>` is wrapped in the editorial `AuthShell` and
 * themed card-less via `clerkAuthAppearance`. The sign-up flow itself is
 * unchanged — only the presentation differs.
 */

export default async function SignUpPage() {
  if (resolveIdentityMode() !== 'team') notFound();
  const { SignUp } = await import('@clerk/nextjs');
  return (
    <AuthShell mode="signup">
      <SignUp appearance={clerkAuthAppearance} routing="path" path="/auth/sign-up" signInUrl="/auth/sign-in" />
    </AuthShell>
  );
}
