import { randomUUID } from 'node:crypto';
import { createLogger } from '@coodra/contextos-shared';
import { and, eq } from 'drizzle-orm';

import type { DbHandle } from './client.js';
import { postgresSchema, sqliteSchema } from './schema/index.js';

/**
 * `packages/db/src/ensure-default-policy` — seeds a baseline Policy
 * + first-match-wins rule set for a project so a fresh
 * `contextos init` ships with real policy enforcement on day one.
 *
 * Phase 3 Fix D (2026-05-02 — closes Phase 2 verification finding
 * F5/F8): pre-Phase-3 init created the project row but inserted
 * zero policy rules. The MCP `check_policy` evaluator returned
 * `'allow'` for everything because no rule ever matched. Result:
 * destructive writes (.env, .git/**, node_modules/**) and dangerous
 * Bash commands (rm -rf /, git push --force) sailed through. Fix D
 * seeds a default Policy named `'__default__'` with the rules listed
 * below.
 *
 * **Rule list (priority order — first match wins):**
 *
 *   1. DENY  PreToolUse / Write / `.env`                — secrets boundary
 *   2. DENY  PreToolUse / Write / `**\/.env`            — secrets boundary
 *   3. DENY  PreToolUse / Write / `.git/**`             — repo metadata
 *   4. DENY  PreToolUse / Write / `node_modules/**`     — dependency tree
 *   5. DENY  PreToolUse / Edit  / `.env`                — secrets boundary
 *   6. DENY  PreToolUse / Edit  / `**\/.env`            — secrets boundary
 *   7. DENY  PreToolUse / Edit  / `.git/**`             — repo metadata
 *   8. DENY  PreToolUse / Edit  / `node_modules/**`     — dependency tree
 *   9. ASK   PreToolUse / Bash  / (no glob — toolName)  — Bash commands warrant a turn-zero ask
 *
 * The Bash rule deliberately matches every Bash invocation rather
 * than trying to detect rm -rf / git push --force / git reset --hard
 * via tool_input.command parsing — picomatch's path-glob axis does
 * not naturally model command-string parsing, and a coarse "ask
 * before any Bash" rule is the safer default. Users who want
 * permissive Bash flip the rule to `'allow'` via a future `policy
 * set` UI; users who want stricter blast radius keep it.
 *
 * Idempotency: keyed on `(projectId, name='__default__')`. A second
 * call returns the existing policy id without re-inserting rules.
 * `--force` is NOT supported here — once the user customizes their
 * policy, re-running init should not reset their tuning.
 */

const seedLogger = createLogger('db.ensure-default-policy');

const DEFAULT_POLICY_NAME = '__default__' as const;
const DEFAULT_POLICY_DESCRIPTION =
  'Default policy seeded by `contextos init` (Phase 3 Fix D, 2026-05-02). ' +
  'Denies writes to .env, .git/**, node_modules/**; asks before Bash. ' +
  'Edit via `policy` UI or by writing custom rules with higher priority.';

interface DefaultRuleSpec {
  readonly priority: number;
  readonly matchEventType: string;
  readonly matchToolName: string;
  readonly matchPathGlob: string | null;
  readonly matchAgentType: string;
  readonly decision: 'allow' | 'deny' | 'ask';
  readonly reason: string;
}

const DEFAULT_RULES: readonly DefaultRuleSpec[] = [
  {
    priority: 10,
    matchEventType: 'PreToolUse',
    matchToolName: 'Write',
    matchPathGlob: '.env',
    matchAgentType: '*',
    decision: 'deny',
    reason: 'writes to .env are denied — secrets must not flow through agent edits',
  },
  {
    priority: 11,
    matchEventType: 'PreToolUse',
    matchToolName: 'Write',
    matchPathGlob: '**/.env',
    matchAgentType: '*',
    decision: 'deny',
    reason: 'writes to .env are denied — secrets must not flow through agent edits',
  },
  {
    priority: 20,
    matchEventType: 'PreToolUse',
    matchToolName: 'Write',
    matchPathGlob: '.git/**',
    matchAgentType: '*',
    decision: 'deny',
    reason: 'writes inside .git/** are denied — repository metadata is owned by `git`, not the agent',
  },
  {
    priority: 30,
    matchEventType: 'PreToolUse',
    matchToolName: 'Write',
    matchPathGlob: 'node_modules/**',
    matchAgentType: '*',
    decision: 'deny',
    reason: 'writes inside node_modules/** are denied — install via package manager, never edit by hand',
  },
  {
    priority: 40,
    matchEventType: 'PreToolUse',
    matchToolName: 'Edit',
    matchPathGlob: '.env',
    matchAgentType: '*',
    decision: 'deny',
    reason: 'edits to .env are denied — secrets must not flow through agent edits',
  },
  {
    priority: 41,
    matchEventType: 'PreToolUse',
    matchToolName: 'Edit',
    matchPathGlob: '**/.env',
    matchAgentType: '*',
    decision: 'deny',
    reason: 'edits to .env are denied — secrets must not flow through agent edits',
  },
  {
    priority: 50,
    matchEventType: 'PreToolUse',
    matchToolName: 'Edit',
    matchPathGlob: '.git/**',
    matchAgentType: '*',
    decision: 'deny',
    reason: 'edits inside .git/** are denied — repository metadata is owned by `git`, not the agent',
  },
  {
    priority: 60,
    matchEventType: 'PreToolUse',
    matchToolName: 'Edit',
    matchPathGlob: 'node_modules/**',
    matchAgentType: '*',
    decision: 'deny',
    reason: 'edits inside node_modules/** are denied — install via package manager, never edit by hand',
  },
  {
    priority: 70,
    matchEventType: 'PreToolUse',
    matchToolName: 'Bash',
    matchPathGlob: null,
    matchAgentType: '*',
    decision: 'ask',
    reason: 'Bash invocations require user confirmation — destructive commands (rm -rf, git push --force) are easy to slip through',
  },
];

export interface EnsureDefaultPolicyResult {
  readonly policyId: string;
  readonly created: boolean;
  readonly rulesInserted: number;
}

export async function ensureDefaultPolicy(db: DbHandle, projectId: string): Promise<EnsureDefaultPolicyResult> {
  if (db.kind === 'sqlite') {
    const existing = await db.db
      .select({ id: sqliteSchema.policies.id })
      .from(sqliteSchema.policies)
      .where(and(eq(sqliteSchema.policies.projectId, projectId), eq(sqliteSchema.policies.name, DEFAULT_POLICY_NAME)))
      .limit(1);
    const existingId = existing[0]?.id;
    if (existingId !== undefined) {
      seedLogger.debug(
        { event: 'default_policy_already_seeded', projectId, policyId: existingId },
        'default policy row already present',
      );
      return { policyId: existingId, created: false, rulesInserted: 0 };
    }
    const policyId = randomUUID();
    await db.db.insert(sqliteSchema.policies).values({
      id: policyId,
      projectId,
      name: DEFAULT_POLICY_NAME,
      description: DEFAULT_POLICY_DESCRIPTION,
      isActive: true,
    });
    const ruleRows = DEFAULT_RULES.map((spec) => ({
      id: randomUUID(),
      policyId,
      priority: spec.priority,
      matchEventType: spec.matchEventType,
      matchToolName: spec.matchToolName,
      matchPathGlob: spec.matchPathGlob,
      matchAgentType: spec.matchAgentType,
      decision: spec.decision,
      reason: spec.reason,
    }));
    await db.db.insert(sqliteSchema.policyRules).values(ruleRows);
    seedLogger.info(
      { event: 'default_policy_seeded', projectId, policyId, rulesInserted: ruleRows.length },
      'inserted default policy + baseline rules (Phase 3 Fix D)',
    );
    return { policyId, created: true, rulesInserted: ruleRows.length };
  }

  // postgres
  const existing = await db.db
    .select({ id: postgresSchema.policies.id })
    .from(postgresSchema.policies)
    .where(
      and(eq(postgresSchema.policies.projectId, projectId), eq(postgresSchema.policies.name, DEFAULT_POLICY_NAME)),
    )
    .limit(1);
  const existingId = existing[0]?.id;
  if (existingId !== undefined) {
    seedLogger.debug(
      { event: 'default_policy_already_seeded', projectId, policyId: existingId },
      'default policy row already present',
    );
    return { policyId: existingId, created: false, rulesInserted: 0 };
  }
  const policyId = randomUUID();
  await db.db.insert(postgresSchema.policies).values({
    id: policyId,
    projectId,
    name: DEFAULT_POLICY_NAME,
    description: DEFAULT_POLICY_DESCRIPTION,
    isActive: true,
  });
  const ruleRows = DEFAULT_RULES.map((spec) => ({
    id: randomUUID(),
    policyId,
    priority: spec.priority,
    matchEventType: spec.matchEventType,
    matchToolName: spec.matchToolName,
    matchPathGlob: spec.matchPathGlob,
    matchAgentType: spec.matchAgentType,
    decision: spec.decision,
    reason: spec.reason,
  }));
  await db.db.insert(postgresSchema.policyRules).values(ruleRows);
  seedLogger.info(
    { event: 'default_policy_seeded', projectId, policyId, rulesInserted: ruleRows.length },
    'inserted default policy + baseline rules (Phase 3 Fix D)',
  );
  return { policyId, created: true, rulesInserted: ruleRows.length };
}
