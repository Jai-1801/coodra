import type { Check } from '../types.js';

/**
 * Module 03.1 (Durable Audit Outbox) closure status.
 *
 * Pre-M03.1 this check was a permanent-yellow placeholder
 * documenting the SIGTERM-mid-PreToolUse data-loss window:
 * `setImmediate(insert)` audits were lost if the process exited
 * before the callback fired. Module 03.1 closed the gap by
 * routing every audit write through `pending_jobs` via
 * `scheduleDurableWrite`, with the OutboxWorker draining to its
 * destination tables.
 *
 * The check now reports GREEN unconditionally — the operational
 * health of the durable outbox is surfaced by checks 21 (queue
 * depth), 22 (oldest pending row), and 23 (dead-letter count).
 * This entry stays in the registry as a load-bearing semantic
 * marker (the M03.1 → done transition is auditable) and as a
 * pointer to the operational checks.
 */
export const auditDurabilityCheck: Check = {
  id: 13,
  name: 'Audit-write durability (Module 03.1 — durable outbox)',
  severity: 'green-or-yellow',
  async run() {
    return {
      status: 'green',
      detail:
        'Closed by Module 03.1 — every audit write is durable on enqueue (pending_jobs). Operational health: see checks 21 (depth), 22 (oldest), 23 (dead-letter).',
    };
  },
};
