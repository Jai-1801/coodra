'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { addPolicyRule, setPolicyActive } from '@/lib/queries/policies';

/**
 * Server actions for policy admin (M04 S5). Both actions are wired to
 * `<form action={fn}>` per Next.js 15 App Router pattern. Errors land
 * in `<input name="error" />` URL state via `redirect` so we don't ship
 * a client-side error toast in S5.
 */

const ADD_RULE_FORM_SCHEMA = z.object({
  projectId: z.string().min(1),
  policyName: z.string().optional(),
  matchToolName: z.string().min(1, 'tool name is required'),
  matchPathGlob: z.string().optional(),
  matchAgentType: z.string().optional(),
  matchEventType: z.enum(['PreToolUse', 'PostToolUse']).optional(),
  decision: z.enum(['allow', 'deny', 'ask']),
  reason: z.string().min(1, 'reason is required'),
  priority: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number.parseInt(v, 10))),
});

export async function addRuleAction(formData: FormData): Promise<void> {
  const parsed = ADD_RULE_FORM_SCHEMA.safeParse({
    projectId: formData.get('projectId') ?? '',
    policyName: formData.get('policyName') ?? undefined,
    matchToolName: formData.get('matchToolName') ?? '',
    matchPathGlob: formData.get('matchPathGlob') ?? undefined,
    matchAgentType: formData.get('matchAgentType') ?? undefined,
    matchEventType: formData.get('matchEventType') ?? undefined,
    decision: formData.get('decision') ?? '',
    reason: formData.get('reason') ?? '',
    priority: formData.get('priority') ?? undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    redirect(
      `/policies/${encodeURIComponent(String(formData.get('returnTo') ?? '__default__'))}?error=${encodeURIComponent(msg)}`,
    );
  }
  const args = parsed.data;
  const result = await addPolicyRule({
    projectId: args.projectId,
    matchToolName: args.matchToolName,
    decision: args.decision,
    reason: args.reason,
    ...(args.policyName !== undefined && args.policyName !== '' ? { policyName: args.policyName } : {}),
    ...(args.matchPathGlob !== undefined && args.matchPathGlob !== '' ? { matchPathGlob: args.matchPathGlob } : {}),
    ...(args.matchAgentType !== undefined && args.matchAgentType !== '' ? { matchAgentType: args.matchAgentType } : {}),
    ...(args.matchEventType !== undefined ? { matchEventType: args.matchEventType } : {}),
    ...(args.priority !== undefined ? { priority: args.priority } : {}),
  });
  revalidatePath('/policies');
  revalidatePath(`/policies/${args.policyName ?? '__default__'}`);
  redirect(`/policies/${args.policyName ?? '__default__'}?added=${encodeURIComponent(result.ruleId)}`);
}

export async function setActiveAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get('identifier') ?? '');
  const active = formData.get('active') === 'true';
  const projectId = formData.get('projectId');
  if (identifier.length === 0) {
    redirect('/policies?error=missing_identifier');
  }
  await setPolicyActive(
    identifier,
    active,
    typeof projectId === 'string' && projectId.length > 0 ? projectId : undefined,
  );
  revalidatePath('/policies');
  revalidatePath(`/policies/${identifier}`);
  redirect(`/policies/${encodeURIComponent(identifier)}?toggled=${active ? 'enabled' : 'disabled'}`);
}
