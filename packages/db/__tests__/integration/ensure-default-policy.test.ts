import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createDb,
  type DbHandle,
  ensureDefaultPolicy,
  ensureProject,
  migrateSqlite,
  sqliteSchema,
} from '../../src/index.js';

/**
 * Locks Phase 3 Fix D (2026-05-02): `contextos init` must seed a
 * default Policy + baseline rules so a fresh install ships with
 * real policy enforcement on day one.
 *
 * Phase 2 verification (2026-04-28) found that pre-Phase-3 init
 * created the `projects` row but inserted zero `policy_rules` —
 * the evaluator returned `'allow'` for every PreToolUse because no
 * rule ever matched. Result: destructive writes (.env, .git/**,
 * node_modules/**) and dangerous Bash commands sailed through
 * without surfacing to the user.
 */

let cwd: string;
let handle: DbHandle;

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), 'ensure-default-policy-test-'));
  const opened = createDb({ kind: 'local', sqlite: { path: join(cwd, 'data.db') } });
  if (opened.kind !== 'sqlite') throw new Error('expected sqlite');
  handle = opened;
  migrateSqlite(handle.db);
});

afterAll(() => {
  if (handle?.kind === 'sqlite') handle.close();
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe('@coodra/contextos-db::ensureDefaultPolicy', () => {
  it('inserts a default Policy row + baseline rule set on first call', async () => {
    if (handle.kind !== 'sqlite') throw new Error('expected sqlite');
    const project = await ensureProject(handle, { slug: 'fresh-policy-project' });

    const result = await ensureDefaultPolicy(handle, project.id);
    expect(result.created).toBe(true);
    expect(result.policyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.rulesInserted).toBeGreaterThan(0);

    const policies = await handle.db
      .select({ id: sqliteSchema.policies.id, name: sqliteSchema.policies.name })
      .from(sqliteSchema.policies)
      .where(eq(sqliteSchema.policies.projectId, project.id));
    expect(policies.length).toBe(1);
    expect(policies[0]?.name).toBe('__default__');

    const rules = await handle.db
      .select({
        priority: sqliteSchema.policyRules.priority,
        matchToolName: sqliteSchema.policyRules.matchToolName,
        matchPathGlob: sqliteSchema.policyRules.matchPathGlob,
        decision: sqliteSchema.policyRules.decision,
      })
      .from(sqliteSchema.policyRules)
      .where(eq(sqliteSchema.policyRules.policyId, result.policyId));
    expect(rules.length).toBe(result.rulesInserted);
    // .env deny rule present.
    const envDeny = rules.find((r) => r.matchPathGlob === '.env' && r.matchToolName === 'Write');
    expect(envDeny?.decision).toBe('deny');
    // node_modules deny rule present.
    const nmDeny = rules.find((r) => r.matchPathGlob === 'node_modules/**' && r.matchToolName === 'Write');
    expect(nmDeny?.decision).toBe('deny');
    // .git deny rule present.
    const gitDeny = rules.find((r) => r.matchPathGlob === '.git/**' && r.matchToolName === 'Write');
    expect(gitDeny?.decision).toBe('deny');
    // Bash ask rule present.
    const bashAsk = rules.find((r) => r.matchToolName === 'Bash');
    expect(bashAsk?.decision).toBe('ask');
  });

  it('is idempotent: a second call returns created:false and inserts no rules', async () => {
    if (handle.kind !== 'sqlite') throw new Error('expected sqlite');
    const project = await ensureProject(handle, { slug: 'idempotent-policy-project' });

    const first = await ensureDefaultPolicy(handle, project.id);
    expect(first.created).toBe(true);

    const second = await ensureDefaultPolicy(handle, project.id);
    expect(second.created).toBe(false);
    expect(second.rulesInserted).toBe(0);
    expect(second.policyId).toBe(first.policyId);

    const policyCount = (
      await handle.db
        .select({ id: sqliteSchema.policies.id })
        .from(sqliteSchema.policies)
        .where(eq(sqliteSchema.policies.projectId, project.id))
    ).length;
    expect(policyCount).toBe(1);
  });

  it('rule priority ordering: secrets boundary first, dependency tree next, Bash ask last', async () => {
    if (handle.kind !== 'sqlite') throw new Error('expected sqlite');
    const project = await ensureProject(handle, { slug: 'priority-policy-project' });
    const result = await ensureDefaultPolicy(handle, project.id);

    const rules = await handle.db
      .select({
        priority: sqliteSchema.policyRules.priority,
        matchToolName: sqliteSchema.policyRules.matchToolName,
        matchPathGlob: sqliteSchema.policyRules.matchPathGlob,
        decision: sqliteSchema.policyRules.decision,
      })
      .from(sqliteSchema.policyRules)
      .where(eq(sqliteSchema.policyRules.policyId, result.policyId))
      .orderBy(sqliteSchema.policyRules.priority);

    // First rule fires for `.env` — the highest-stake target (secrets).
    expect(rules[0]?.matchPathGlob).toBe('.env');
    expect(rules[0]?.decision).toBe('deny');
    // Last rule is Bash ask.
    expect(rules[rules.length - 1]?.matchToolName).toBe('Bash');
    expect(rules[rules.length - 1]?.decision).toBe('ask');
  });
});
