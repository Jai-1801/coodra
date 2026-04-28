/**
 * Module 03.1 — retry backoff schedule for the durable audit outbox.
 *
 * Per OQ3 (locked at sign-off, 2026-04-27): 1s → 5s → 30s → 5min →
 * 30min, 6 max attempts. After the 6th attempt fails, the row is
 * marked dead and surfaced via the doctor dead-letter check.
 *
 * Five delays + the first-try-immediate = six total attempts. The
 * delays are deliberately a fixed schedule rather than exponential
 * with jitter because:
 *   - The audit outbox volume is low (one row per tool call); jitter
 *     to spread retries across many workers isn't load-bearing.
 *   - A hand-curated schedule maps directly to a human-debuggable
 *     SLO (5min mark = "you have a problem", 30min mark = "the
 *     remediation flow has 30 minutes before the dead-letter").
 *   - Reproducible across test runs without `vi.useFakeTimers`
 *     entanglement — the test asserts on a known schedule.
 */

/**
 * Delays in milliseconds before retry N+1, indexed by zero-based
 * attempts-completed. After attempts=1 the next retry uses index 0
 * (1s); after attempts=5 the next retry uses index 4 (30 min).
 * After attempts=6 we give up and never compute a backoff.
 */
export const RETRY_DELAYS_MS: ReadonlyArray<number> = [
  1_000, // 1s
  5_000, // 5s
  30_000, // 30s
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
];

/** Default `maxAttempts` for the OutboxWorker. */
export const MAX_ATTEMPTS_DEFAULT = 6;

/**
 * Compute the backoff (ms) before the next retry, given the count of
 * attempts COMPLETED so far. `attempts=1` → 1s, `attempts=2` → 5s,
 * etc. Throws if called past the last index — callers MUST check
 * `shouldGiveUp` first.
 */
export function computeBackoff(attempts: number): number {
  if (attempts < 1) {
    throw new RangeError(`computeBackoff: attempts must be >= 1, got ${attempts}`);
  }
  if (attempts > RETRY_DELAYS_MS.length) {
    throw new RangeError(
      `computeBackoff: no backoff defined for attempts=${attempts} (schedule has ${RETRY_DELAYS_MS.length} entries; check shouldGiveUp first)`,
    );
  }
  // attempts=1 returns RETRY_DELAYS_MS[0]; attempts=5 returns RETRY_DELAYS_MS[4].
  const delay = RETRY_DELAYS_MS[attempts - 1];
  if (delay === undefined) {
    throw new RangeError(`computeBackoff: schedule index ${attempts - 1} undefined`);
  }
  return delay;
}

/**
 * `true` when the current attempt count meets-or-exceeds the
 * configured cap. The worker uses this to decide between scheduling
 * another retry and marking the row dead.
 */
export function shouldGiveUp(attempts: number, maxAttempts: number = MAX_ATTEMPTS_DEFAULT): boolean {
  return attempts >= maxAttempts;
}
