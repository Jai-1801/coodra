/**
 * Module 03.1 — public types for the durable audit outbox worker.
 *
 * The worker is in `@contextos/cli` (this package) because both the
 * `apps/hooks-bridge` and `apps/mcp-server` daemons import it: code
 * shared between two apps lives in a `packages/*` package, and the
 * CLI package already houses daemon abstractions, so adding a new
 * package here would just be a third-team-mode-style indirection
 * with no benefit.
 *
 * The worker pulls a single row from `pending_jobs` per tick (atomic
 * UPDATE-with-LIMIT-1 — SQLite serializes writes at the file lock,
 * Postgres uses FOR UPDATE SKIP LOCKED), invokes the consumer's
 * `OutboxDispatchHandler` to apply the row to its destination table,
 * then on success deletes the row, on transient failure schedules a
 * retry with backoff, on permanent failure (or after maxAttempts)
 * marks the row dead.
 */

export interface OutboxJob {
  /** `pending_jobs.id` — durable across worker restarts. */
  readonly id: string;
  /** `pending_jobs.queue` — routes to the right destination handler. */
  readonly queue: string;
  /**
   * `pending_jobs.payload`, JSON-parsed. The dispatch handler is
   * responsible for narrowing this to the queue-specific shape it
   * expects (Zod or a hand-rolled type guard).
   */
  readonly payload: unknown;
  /**
   * Attempt counter (1-indexed) AFTER the worker bumps it on claim.
   * On the first call this is `1`; on the fifth retry, `5`. The
   * worker uses this with `computeBackoff` to schedule retries.
   */
  readonly attempts: number;
}

/**
 * The dispatch outcome.
 *
 * - `success` — destination INSERT landed (or was a duplicate-key
 *   no-op handled idempotently by the destination INSERT). Worker
 *   deletes the `pending_jobs` row.
 * - `transient_failure` — the destination is temporarily unavailable
 *   (DB busy, FK target not yet seeded, network hiccup). Worker
 *   schedules a retry with backoff. After `maxAttempts` cumulative
 *   transient failures, the row is marked dead.
 * - `permanent_failure` — the row is malformed or the destination
 *   has rejected it for a reason that won't change with retries
 *   (schema violation, payload missing required field). Worker
 *   marks dead immediately.
 */
export type OutboxDispatchOutcome =
  | { readonly status: 'success' }
  | { readonly status: 'transient_failure'; readonly error: string }
  | { readonly status: 'permanent_failure'; readonly error: string };

/**
 * The consumer's dispatch contract. Bridge and mcp-server each
 * provide one (S2). Throwing from the handler is treated as a
 * transient failure (the message becomes `last_error`); prefer
 * returning an explicit outcome so behavior is testable without
 * relying on exception flow.
 */
export type OutboxDispatchHandler = (job: OutboxJob) => Promise<OutboxDispatchOutcome>;

/**
 * `pending_jobs.queue` values minted by Module 03.1. Listed here so
 * a typo at any callsite is a compile-time error. New queues land
 * with the slice that introduces them — keep this list in sync.
 */
export type OutboxQueueKind = 'run_event' | 'session_open' | 'session_close' | 'policy_decision';
