import type { DbHandle } from '@coodra/db';
import { assertManifestDescriptionValid } from '@coodra/shared/test-utils';
import { describe, expect, it } from 'vitest';

import { createPrepareJiraCommentToolRegistration } from '../../../src/tools/prepare-jira-comment/manifest.js';
import {
  prepareJiraCommentInputSchema,
  prepareJiraCommentOutputSchema,
} from '../../../src/tools/prepare-jira-comment/schema.js';

/**
 * Unit tests for `coodra__prepare_jira_comment` (Module 09 Track 9A,
 * ADR-016 — the on-request write-back helper) — manifest contract + schema
 * boundaries. DB-backed assembly is covered in the integration test.
 */

const fakeDb = { kind: 'sqlite', db: {}, raw: {}, close: () => {} } as unknown as DbHandle;

describe('prepare_jira_comment — manifest contract', () => {
  it('satisfies every §24.3 rule', () => {
    const registration = createPrepareJiraCommentToolRegistration({ db: fakeDb });
    expect(() => assertManifestDescriptionValid(registration, { folderName: 'prepare-jira-comment' })).not.toThrow();
  });

  it('name is exactly "prepare_jira_comment"', () => {
    expect(createPrepareJiraCommentToolRegistration({ db: fakeDb }).name).toBe('prepare_jira_comment');
  });

  it('idempotencyKey is readonly and keyed on runId + maxDecisions (default 3)', () => {
    const registration = createPrepareJiraCommentToolRegistration({ db: fakeDb });
    const def = registration.idempotencyKey(
      { runId: 'run:p:s:u', maxDecisions: 3 },
      { sessionId: 's', receivedAt: new Date(0) },
    );
    expect(def.kind).toBe('readonly');
    expect(def.key).toBe('prepare_jira_comment:run:p:s:u:3');
    const five = registration.idempotencyKey(
      { runId: 'r', maxDecisions: 5 },
      { sessionId: 's', receivedAt: new Date(0) },
    );
    expect(five.key).toBe('prepare_jira_comment:r:5');
  });
});

describe('prepare_jira_comment — input schema boundaries', () => {
  it('accepts a runId and defaults maxDecisions to 3', () => {
    const parsed = prepareJiraCommentInputSchema.safeParse({ runId: 'run:p:s:u' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.maxDecisions).toBe(3);
  });

  it('rejects maxDecisions out of range and an empty runId and unknown keys', () => {
    expect(prepareJiraCommentInputSchema.safeParse({ runId: 'r', maxDecisions: 11 }).success).toBe(false);
    expect(prepareJiraCommentInputSchema.safeParse({ runId: 'r', maxDecisions: -1 }).success).toBe(false);
    expect(prepareJiraCommentInputSchema.safeParse({ runId: '' }).success).toBe(false);
    expect(prepareJiraCommentInputSchema.safeParse({ runId: 'r', extra: 1 }).success).toBe(false);
  });
});

describe('prepare_jira_comment — output schema (discriminated union)', () => {
  it('parses success and both soft-failure branches', () => {
    expect(prepareJiraCommentOutputSchema.safeParse({ ok: true, issueRef: 'PROJ-1', body: '…' }).success).toBe(true);
    expect(prepareJiraCommentOutputSchema.safeParse({ ok: false, error: 'run_not_found', howToFix: 'x' }).success).toBe(
      true,
    );
    expect(prepareJiraCommentOutputSchema.safeParse({ ok: false, error: 'not_linked', howToFix: 'x' }).success).toBe(
      true,
    );
  });

  it('rejects an unknown error code', () => {
    expect(prepareJiraCommentOutputSchema.safeParse({ ok: false, error: 'whatever', howToFix: 'x' }).success).toBe(
      false,
    );
  });
});
