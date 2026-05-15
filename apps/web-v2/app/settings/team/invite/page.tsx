import { redirect } from 'next/navigation';

import { resolveIdentityMode } from '@/lib/deployment-mode';

export const dynamic = 'force-dynamic';

/**
 * `/settings/team/invite` — currently a thin redirect to the main
 * `/settings/team` page, where the invite form lives inline.
 *
 * Phase G — invites work in any team mode (laptop or cloud). Solo
 * mode redirects to settings root (no team to invite to).
 */

export default function InviteRedirectPage() {
  if (resolveIdentityMode() !== 'team') redirect('/settings/team');
  redirect('/settings/team#invite');
}
