import { describe, expect, it } from 'vitest';
import {
  graphifyPythonCandidates,
  type PythonCandidate,
  resolveGraphifyPython,
  type VerifyResult,
  verifyGraphifyPython,
} from '../../../src/lib/init/graphify-python.js';

/**
 * Locks the Graphify interpreter auto-detection (the fix for the
 * recurring "graphify MCP server failed" — bare `python3` was wired even
 * when it couldn't `import graphify.serve, mcp`). The resolver probes
 * candidate interpreters and wires the first that verifies; everything is
 * injectable so these tests never spawn a real `python`.
 */

const ok: VerifyResult = { ok: true };
const importFail = (detail: string): VerifyResult => ({ ok: false, reason: 'import_failed', detail });

describe('resolveGraphifyPython — explicit --python', () => {
  it('honours an explicit interpreter that verifies (source=flag, verified)', async () => {
    const r = await resolveGraphifyPython({
      explicit: '/x/.venv/bin/python',
      cwd: '/proj',
      env: {},
      verify: async () => ok,
    });
    expect(r).toEqual({ python: '/x/.venv/bin/python', verified: true, source: 'flag' });
  });

  it('still wires an explicit interpreter that FAILS to verify, flagged unverified + detail', async () => {
    const r = await resolveGraphifyPython({
      explicit: '/x/python',
      cwd: '/proj',
      env: {},
      verify: async () => importFail("No module named 'graphify'"),
    });
    expect(r.python).toBe('/x/python');
    expect(r.verified).toBe(false);
    expect(r.source).toBe('flag');
    expect(r.detail).toContain('graphify');
  });

  it('trims whitespace and treats a blank explicit value as "omitted"', async () => {
    // Blank explicit → falls through to candidate detection.
    const r = await resolveGraphifyPython({
      explicit: '   ',
      cwd: '/proj',
      env: {},
      candidates: [{ path: '/detected/python', source: 'uv-tool' }],
      verify: async (p) => (p === '/detected/python' ? ok : importFail('x')),
    });
    expect(r).toEqual({ python: '/detected/python', verified: true, source: 'uv-tool' });
  });
});

describe('resolveGraphifyPython — auto-detection', () => {
  it('returns the FIRST candidate that verifies', async () => {
    const candidates: PythonCandidate[] = [
      { path: '/a/python', source: 'venv' },
      { path: '/b/python', source: 'uv-tool' },
      { path: '/c/python', source: 'python3' },
    ];
    const r = await resolveGraphifyPython({
      cwd: '/proj',
      env: {},
      candidates,
      verify: async (p) => (p === '/b/python' ? ok : importFail('nope')),
    });
    expect(r).toEqual({ python: '/b/python', verified: true, source: 'uv-tool' });
  });

  it('falls back to python3 (unverified) when no candidate verifies, carrying the last detail', async () => {
    const r = await resolveGraphifyPython({
      cwd: '/proj',
      env: {},
      candidates: [
        { path: '/a/python', source: 'venv' },
        { path: '/b/python', source: 'uv-tool' },
      ],
      verify: async () => importFail('last failure here'),
    });
    expect(r.python).toBe('python3');
    expect(r.verified).toBe(false);
    expect(r.source).toBe('fallback');
    expect(r.detail).toBe('last failure here');
  });
});

describe('graphifyPythonCandidates — ordering + dedup', () => {
  it('orders active virtualenv → .venv → uv-tool → python3 → python and dedups paths', async () => {
    const candidates = await graphifyPythonCandidates({
      cwd: '/proj',
      env: { VIRTUAL_ENV: '/active', HOME: '/home/test', PATH: '' },
      runUvToolDir: async () => '/uvbase',
    });
    const paths = candidates.map((c) => c.path);
    // No duplicates.
    expect(new Set(paths).size).toBe(paths.length);
    // Most-specific first.
    expect(candidates[0]).toEqual({ path: '/active/bin/python', source: 'virtualenv' });
    expect(candidates[1]).toEqual({ path: '/proj/.venv/bin/python', source: 'venv' });
    // uv-tool base (injected) is probed.
    expect(paths).toContain('/uvbase/graphifyy/bin/python');
    // PATH fallbacks always present, last.
    expect(paths).toContain('python3');
    expect(paths).toContain('python');
    expect(candidates.at(-1)).toEqual({ path: 'python', source: 'python' });
  });

  it('omits the virtualenv candidate when VIRTUAL_ENV is unset', async () => {
    const candidates = await graphifyPythonCandidates({
      cwd: '/proj',
      env: { HOME: '/home/test', PATH: '' },
      runUvToolDir: async () => null,
    });
    expect(candidates.some((c) => c.source === 'virtualenv')).toBe(false);
    expect(candidates[0]).toEqual({ path: '/proj/.venv/bin/python', source: 'venv' });
  });
});

describe('verifyGraphifyPython — real subprocess', () => {
  it('reports spawn_failed for a non-existent interpreter', async () => {
    const r = await verifyGraphifyPython('/definitely/not/here/python', { timeoutMs: 5_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('spawn_failed');
  });
});
