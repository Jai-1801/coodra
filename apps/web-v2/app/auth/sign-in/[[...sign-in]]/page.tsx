import { notFound } from 'next/navigation';

import { AuthShell } from '@/components/AuthShell';
import { clerkAuthAppearance } from '@/lib/clerk-appearance';
import { resolveIdentityMode } from '@/lib/deployment-mode';

export const dynamic = 'force-dynamic';

/**
 * `/auth/sign-in/[[...sign-in]]` — Clerk's catch-all sign-in route.
 *
 * Phase G (2026-05-12) — renders in any TEAM mode (laptop or cloud).
 * The catch-all segment captures the sub-paths Clerk's hosted flow uses
 * (`/auth/sign-in/factor-one`, `/auth/sign-in/sso-callback`, etc).
 *
 * In solo mode this returns 404 because there's no Clerk to sign into —
 * the local config IS the identity (Phase G + §19).
 *
 * UI: Clerk's `<SignIn>` is wrapped in the editorial `AuthShell` and
 * themed card-less via `clerkAuthAppearance`. The authentication flow
 * (password, Google, GitHub, MFA) is unchanged — only the surrounding
 * presentation differs.
 */

export default async function SignInPage() {
  if (resolveIdentityMode() !== 'team') notFound();
  // Defer the Clerk SignIn import so local bundles never pay the cost.
  const { SignIn } = await import('@clerk/nextjs');
  return (
    <AuthShell mode="signin">
      <SignIn appearance={clerkAuthAppearance} routing="path" path="/auth/sign-in" signUpUrl="/auth/sign-up" />
    </AuthShell>
  );
}
