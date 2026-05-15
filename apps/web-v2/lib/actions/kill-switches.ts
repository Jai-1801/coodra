'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertActorRole } from '@/lib/action-guards';
import {
  findDuplicateActive,
  insertKillSwitchWithSync,
  listActive,
  softResumeWithSync,
} from '@/lib/queries/kill-switches';

/**
 * Server actions for the kill-switch admin (M04 S8b). In team mode
 * every write enqueues a sync_to_cloud row via insertKillSwitchWithSync
 * / softResumeWithSync; the sync-daemon's puller (S8a) on every
 * connected developer surfaces the change within ~10s p95.
 */

const PAUSE_FORM_SCHEMA = z.object({
  scope: z.enum(['global', 'project', 'tool', 'agent_type']),
  target: z.string().optional(),
  mode: z.enum(['hard', 'soft']),
  reason: z.string().min(1, 'reason is required'),
  expiresAt: z.string().optional(),
  force: z.string().optional(),
});

export async function pauseAction(formData: FormData): Promise<void> {
  // Pause is admin-or-member. The role check just gates viewer (read-only).
  const actor = await assertActorRole('member');

  const parsed = PAUSE_FORM_SCHEMA.safeParse({
    scope: formData.get('scope') ?? 'global',
    target: formData.get('target') ?? undefined,
    mode: formData.get('mode') ?? 'hard',
    reason: formData.get('reason') ?? '',
    expiresAt: formData.get('expiresAt') ?? undefined,
    force: formData.get('force') ?? undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    redirect(`/kill-switches?error=${encodeURIComponent(msg)}`);
  }
  const args = parsed.data;
  if (args.scope !== 'global' && (args.target === undefined || args.target.trim() === '')) {
    redirect(`/kill-switches?error=${encodeURIComponent(`scope='${args.scope}' requires a target`)}`);
  }
  const target = args.scope === 'global' ? null : (args.target ?? '').trim();

  // Duplicate-active guard (matches CLI's pause behaviour). Force
  // overrides — second submit allows two active rows at the same
  // (scope, target).
  if (args.force !== 'true') {
    const active = await listActive();
    const dup = findDuplicateActive(active, { scope: args.scope, target });
    if (dup !== null) {
      redirect(
        `/kill-switches?duplicate=${encodeURIComponent(dup.id)}&scope=${encodeURIComponent(args.scope)}&target=${encodeURIComponent(target ?? '')}`,
      );
    }
  }

  let expiresAt: Date | null = null;
  if (args.expiresAt !== undefined && args.expiresAt !== '') {
    const parsedDate = new Date(args.expiresAt);
    if (!Number.isNaN(parsedDate.getTime())) expiresAt = parsedDate;
  }

  const inserted = await insertKillSwitchWithSync({
    scope: args.scope,
    target,
    mode: args.mode,
    reason: args.reason,
    pausedBySessionId: `web:${actor.userId}`,
    expiresAt,
  });
  revalidatePath('/kill-switches');
  revalidatePath('/');
  redirect(`/kill-switches?paused=${encodeURIComponent(inserted.id)}`);
}

export async function resumeAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (id.length === 0) redirect('/kill-switches?error=missing_id');

  // RBAC: members can resume; viewers can't. Per-user "you can only
  // resume your own pause" gating needs `kill_switches.paused_by_user_id`
  // (the schema today has `paused_by_session_id` only). Tracked as a
  // Phase-2 follow-up; for now any member-or-higher can resume any pause.
  const actor = await assertActorRole('member');

  const result = await softResumeWithSync({ id, resumedBySessionId: `web:${actor.userId}` });
  revalidatePath('/kill-switches');
  revalidatePath('/');
  if (result === null) {
    redirect(
      `/kill-switches?error=${encodeURIComponent(`No active kill-switch with id '${id}' (already resumed or never existed)`)}`,
    );
  }
  redirect(`/kill-switches?resumed=${encodeURIComponent(id)}`);
}
