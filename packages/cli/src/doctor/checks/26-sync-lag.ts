import { access } from 'node:fs/promises';

import { createPostgresDb } from '@coodra/contextos-db';

import { openLocalDb } from '../../lib/open-local-db.js';
import type { Check } from '../types.js';

/**
 * Module 04a doctor surface — sync lag.
 *
 * Compares the newest `runs.created_at` on local SQLite with the
 * newest on cloud Postgres. The delta is "how far behind cloud is."
 *
 * Skipped in solo mode (no cloud) and when cloud is unreachable
 * (check 24 covers that case).
 *
 * Thresholds:
 *   - lag < 30s → green (within hot-path sync window)
 *   - lag < 5min → yellow (catchup poll covering)
 *   - lag ≥ 5min → red (sync wedged)
 */
export const syncLagCheck: Check = {
  id: 26,
  name: 'sync lag (Module 04a sync-daemon)',
  severity: 'green-or-yellow',
  async run(ctx) {
    if (ctx.env.CONTEXTOS_MODE !== 'team') {
      return { status: 'skipped', detail: 'CONTEXTOS_MODE != team' };
    }
    const databaseUrl = ctx.env.DATABASE_URL;
    if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
      return { status: 'skipped', detail: 'DATABASE_URL not set' };
    }
    try {
      await access(ctx.dataDb);
    } catch {
      return { status: 'skipped', detail: 'data.db missing — check 3 covers this' };
    }

    let local: Awaited<ReturnType<typeof openLocalDb>>;
    try {
      local = await openLocalDb(ctx.dataDb);
    } catch (err) {
      return { status: 'skipped', detail: `cannot open ${ctx.dataDb}: ${(err as Error).message}` };
    }

    let cloud: ReturnType<typeof createPostgresDb> | null = null;
    try {
      try {
        cloud = createPostgresDb({ databaseUrl });
      } catch (err) {
        return { status: 'skipped', detail: `cloud connect failed (check 24): ${(err as Error).message}` };
      }

      // SQLite schema stores `runs.created_at` as integer Unix seconds
      // (drizzle `integer({ mode: 'timestamp' })`).
      const localNewestRow = local.raw.prepare(`SELECT MAX(created_at) AS s FROM runs`).get() as
        | { s: number | null }
        | undefined;
      const localNewest = localNewestRow?.s ?? null;

      let cloudNewest: number | null = null;
      try {
        const rows = await cloud.raw<Array<{ s: Date | null }>>`SELECT MAX(created_at) AS s FROM runs`;
        cloudNewest = rows[0]?.s ? Math.floor(rows[0].s.getTime() / 1000) : null;
      } catch (err) {
        return { status: 'skipped', detail: `cloud query failed: ${(err as Error).message}` };
      }

      if (localNewest === null) {
        return { status: 'green', detail: 'no local runs yet — nothing to lag on' };
      }
      const cloudOrZero = cloudNewest ?? 0;
      const lagSec = Math.max(0, localNewest - cloudOrZero);

      if (cloudNewest === null && localNewest !== null) {
        // No cloud rows at all yet.
        return {
          status: lagSec > 5 * 60 ? 'red' : lagSec > 30 ? 'yellow' : 'green',
          detail: `cloud has no runs rows; local has ${localNewest ? 'rows' : 'none'} (${formatLag(lagSec)} behind)`,
          remediation:
            cloudOrZero === 0
              ? 'Cloud is empty. If this is the first deploy, the daemon will catch up after the first sync window.'
              : 'Sync may be stalled — inspect sync-daemon logs.',
        };
      }

      if (lagSec < 30)
        return { status: 'green', detail: `cloud is ${formatLag(lagSec)} behind local — within hot-path window` };
      if (lagSec < 5 * 60) {
        return {
          status: 'yellow',
          detail: `cloud is ${formatLag(lagSec)} behind local`,
          remediation: 'Catchup poll should reduce this; if it persists check sync-daemon logs.',
        };
      }
      return {
        status: 'red',
        detail: `cloud is ${formatLag(lagSec)} behind local — sync wedged`,
        remediation:
          'Sync has fallen significantly behind. Check check 25 (queue depth) and check 27 (dead-letter). ' +
          'Restart the sync-daemon if needed.',
      };
    } finally {
      try {
        local.close();
      } catch {
        // ignore
      }
      try {
        await cloud?.close();
      } catch {
        // ignore
      }
    }
  },
};

function formatLag(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60}s`;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}h${minutes}m`;
}
