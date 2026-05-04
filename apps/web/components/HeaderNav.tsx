import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import Link from 'next/link';

import { PlusIcon } from '@/components/ui';
import type { Actor } from '@/lib/auth';
import { clerkAppearance } from '@/lib/clerk-appearance';
import { SoloModeBadge } from './SoloModeBadge';

/**
 * `apps/web/components/HeaderNav.tsx` — workspace-level header
 * (M04 Phase 2 S2c, restyled in Phase 2 UI for primitive parity).
 *
 * Hub-and-spoke IA puts every operational route under
 * `/projects/[slug]/...`. The workspace header therefore stays
 * narrow:
 *
 *   - Brand mark — links to `/` (project picker hub).
 *   - Workspace links: Projects · Sync · Settings.
 *   - "+ New project" CTA (visually emphasized, primary nav action).
 *   - User menu / org switcher (team mode) or solo badge.
 *
 * The visual weight ordering matches the user's mental model: the
 * brand is the home anchor, "Projects" is the primary destination,
 * the New-Project CTA is the primary action, Sync + Settings are
 * tucked to the right of center as utilities.
 */

export interface HeaderNavProps {
  readonly actor: Actor;
}

export function HeaderNav({ actor }: HeaderNavProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-(--color-border-subtle) bg-(--color-bg-surface)">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-(--space-page-x)">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            aria-label="ContextOS home"
            className="font-display text-base font-black uppercase tracking-widest text-(--color-text-primary) transition-colors duration-200 hover:text-(--color-brand)"
          >
            [CTX]<span className="text-(--color-brand)">OS</span>
          </Link>
          <nav aria-label="Workspace" className="flex items-center gap-6">
            <Link
              href="/"
              className="font-display text-xs font-bold uppercase tracking-widest text-(--color-text-primary) transition-colors duration-200 hover:text-(--color-brand)"
            >
              Projects
            </Link>
            <Link
              href="/sync"
              className="font-display text-xs font-bold uppercase tracking-widest text-(--color-text-secondary) transition-colors duration-200 hover:text-(--color-brand)"
            >
              Sync
            </Link>
            <Link
              href="/settings/workspace"
              className="font-display text-xs font-bold uppercase tracking-widest text-(--color-text-secondary) transition-colors duration-200 hover:text-(--color-brand)"
            >
              Settings
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/init"
            className="inline-flex h-9 items-center gap-1.5 border border-(--color-brand) bg-(--color-brand) px-3 font-display text-xs font-bold uppercase tracking-widest text-white transition-colors duration-200 hover:bg-(--color-brand-hover)"
          >
            <PlusIcon className="h-3 w-3" />
            <span>New project</span>
          </Link>
          {actor.mode === 'solo' ? (
            <SoloModeBadge />
          ) : (
            <>
              <OrganizationSwitcher
                appearance={clerkAppearance}
                hidePersonal
                afterCreateOrganizationUrl="/"
                afterSelectOrganizationUrl="/"
              />
              <UserButton appearance={clerkAppearance} userProfileUrl="/settings/account" />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
