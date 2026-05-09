import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { createDb, type PostgresHandle, postgresSchema, type SqliteHandle } from '@coodra/contextos-db';
import { createLogger } from '@coodra/contextos-shared';
import { and, eq } from 'drizzle-orm';
import pc from 'picocolors';
import { EXIT_USER_ACTION_REQUIRED } from '../exit-codes.js';
import { resolveContextosDataDb, resolveContextosHome } from '../lib/contextos-home.js';
import { clearTeamHomeEnv, upgradeToTeamConfig, writeTeamHomeEnv } from '../lib/team-config.js';
import {
  applyConflictResolutions,
  assertNoInFlightAttempt,
  buildMigrationPlan,
  executeMigration,
  type MigrationCounts,
  type MigrationProgressEvent,
  type MigrationResult,
  rollbackMigration,
  snapshotLocalDb,
} from '../lib/team-migrate/index.js';

import type { TeamCommandIO } from './team.js';
import { DEFAULT_TEAM_IO } from './team.js';

/**
 * `packages/cli/src/commands/team-migrate-cmd.ts` — Module 04 Phase 4.
 *
 * Three team-mode CLI commands sharing a single file because they all
 * touch the same surface (team-config + team-migrate engine + cloud
 * Postgres handle):
 *
 *   - `contextos team migrate`  → solo→team data move
 *   - `contextos team join`     → full cloud-pull seed for new team-members
 *   - `contextos team leave`    → revert to solo (clears team config + drops
 *                                  team-tagged local rows)
 *
 * Authentication shape (v1 — pre-Clerk-OAuth integration):
 *   - The user obtains their Clerk user_id, org_id, and a local hook
 *     secret via the web onboarding flow at https://app.contextos.dev/
 *     onboarding/connect (deferred — currently they paste from the
 *     Clerk dashboard).
 *   - These values arrive at the CLI via flags (`--user-id`, `--org-id`,
 *     `--secret`) OR env vars (`CONTEXTOS_TEAM_USER_ID`,
 *     `CONTEXTOS_TEAM_ORG_ID`, `CONTEXTOS_TEAM_HOOK_SECRET`).
 *   - Future M04 follow-on: replace this hand-off with a one-time
 *     `contextos team join <code>` that exchanges a code for the
 *     credentials over an authenticated HTTPS round-trip. For now the
 *     web onboarding renders the flag string and the user pastes.
 */

const cliLogger = createLogger('cli.team-commands');

export interface TeamMigrateOptions {
  readonly userId?: string;
  readonly orgId?: string;
  readonly secret?: string;
  readonly databaseUrl?: string;
  /** Skip the dry-run prompt and migrate immediately. */
  readonly yes?: boolean;
  /** Continue an existing in-flight migration (if one is found). */
  readonly resume?: boolean;
  /** Roll back the most-recent in-flight migration instead of running a new one. */
  readonly rollback?: boolean;
}

export interface TeamJoinOptions {
  readonly userId?: string;
  readonly orgId?: string;
  readonly orgSlug?: string;
  readonly secret?: string;
  readonly databaseUrl?: string;
}

export interface TeamLeaveOptions {
  readonly yes?: boolean;
}

interface ResolvedCredentials {
  readonly userId: string;
  readonly orgId: string;
  readonly secret: string;
  readonly databaseUrl: string;
}

function resolveCredentials(
  flags: { userId?: string; orgId?: string; secret?: string; databaseUrl?: string },
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCredentials | { error: string } {
  const userId = flags.userId ?? env.CONTEXTOS_TEAM_USER_ID;
  const orgId = flags.orgId ?? env.CONTEXTOS_TEAM_ORG_ID;
  const secret = flags.secret ?? env.CONTEXTOS_TEAM_HOOK_SECRET;
  const databaseUrl = flags.databaseUrl ?? env.DATABASE_URL;
  if (typeof userId !== 'string' || userId.length === 0) {
    return { error: 'missing user id (use --user-id or CONTEXTOS_TEAM_USER_ID)' };
  }
  if (typeof orgId !== 'string' || orgId.length === 0) {
    return { error: 'missing org id (use --org-id or CONTEXTOS_TEAM_ORG_ID)' };
  }
  if (typeof secret !== 'string' || secret.length === 0) {
    return { error: 'missing local hook secret (use --secret or CONTEXTOS_TEAM_HOOK_SECRET)' };
  }
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    return { error: 'missing database url (use --database-url or DATABASE_URL)' };
  }
  return { userId, orgId, secret, databaseUrl };
}

function fmtCounts(c: MigrationCounts): string {
  return [
    `${c.projects} projects`,
    `${c.runs} runs`,
    `${c.runEvents} run_events`,
    `${c.contextPacks} context_packs`,
    `${c.decisions} decisions`,
    `${c.policies} policies`,
    `${c.featurePacks} feature_packs`,
    `${c.runDiffs} run_diffs`,
  ].join(' · ');
}

// ---------------------------------------------------------------------------
// migrate
// ---------------------------------------------------------------------------

export async function runTeamMigrateCommand(
  options: TeamMigrateOptions = {},
  io: TeamCommandIO = DEFAULT_TEAM_IO,
): Promise<never> {
  const creds = resolveCredentials(options);
  if ('error' in creds) {
    io.writeStderr(`${pc.red('contextos team migrate')}: ${creds.error}\n`);
    return io.exit(EXIT_USER_ACTION_REQUIRED);
  }

  const home = resolveContextosHome();
  const dataDb = resolveContextosDataDb(home);
  const snapshotPath = join(home, `data.db.pre-migrate-${Date.now()}`);

  let local: SqliteHandle;
  let cloud: PostgresHandle;
  try {
    const localHandle = createDb({ kind: 'local', sqlite: { path: dataDb } });
    if (localHandle.kind !== 'sqlite') throw new Error('expected sqlite local handle');
    local = localHandle;
    const cloudHandle = createDb({ kind: 'cloud', postgres: { databaseUrl: creds.databaseUrl } });
    if (cloudHandle.kind !== 'postgres') throw new Error('expected postgres cloud handle');
    cloud = cloudHandle;
  } catch (err) {
    io.writeStderr(`${pc.red('migrate failed at preflight')}: ${err instanceof Error ? err.message : String(err)}\n`);
    return io.exit(1);
  }

  try {
    if (options.rollback === true) {
      io.writeStdout(pc.yellow('rollback mode: undoing the most-recent in-flight migration\n'));
      const inflight = await cloud.db
        .select()
        .from(postgresSchema.migrationAttempts)
        .where(
          and(
            eq(postgresSchema.migrationAttempts.clerkOrgId, creds.orgId),
            eq(postgresSchema.migrationAttempts.clerkUserId, creds.userId),
            eq(postgresSchema.migrationAttempts.status, 'running'),
          ),
        )
        .limit(1);
      const attempt = inflight[0];
      if (attempt === undefined) {
        io.writeStderr(`${pc.yellow('rollback')}: no in-flight migration found for this user+org\n`);
        return io.exit(EXIT_USER_ACTION_REQUIRED);
      }
      const result = await rollbackMigration({
        cloud,
        attemptId: attempt.id,
        localDbPath: dataDb,
        snapshotPath: snapshotPath, // will not exist; rollback handles missing
      });
      io.writeStdout(
        pc.green(
          `rollback complete: deleted ${result.cloudRowsDeleted} cloud row(s); local ${
            result.localRestored ? 'restored from snapshot' : 'NOT restored (no snapshot found)'
          }\n`,
        ),
      );
      return io.exit(0);
    }

    await assertNoInFlightAttempt(cloud, creds.orgId, creds.userId);

    io.writeStdout(pc.cyan('contextos team migrate — building plan...\n'));
    const plan = await buildMigrationPlan({
      local,
      cloud,
      clerkUserId: creds.userId,
      clerkOrgId: creds.orgId,
    });

    io.writeStdout(`${pc.dim('source machine:')} ${plan.sourceMachine}\n`);
    io.writeStdout(`${pc.dim('target org:')} ${creds.orgId}\n`);
    io.writeStdout(`${pc.dim('user:')} ${creds.userId}\n`);
    io.writeStdout(`${pc.dim('local row counts:')} ${fmtCounts(plan.counts)}\n`);

    if (plan.counts.projects === 0) {
      io.writeStdout(pc.yellow('no local projects to migrate; aborting (run `contextos init` first)\n'));
      return io.exit(0);
    }

    if (plan.conflicts.length > 0) {
      io.writeStdout(pc.yellow(`\nslug conflicts detected (${plan.conflicts.length}):\n`));
      for (const c of plan.conflicts) {
        io.writeStdout(`  · '${c.slug}' already exists in cloud (cloud project_id: ${c.cloudProjectId})\n`);
      }
      io.writeStdout(
        pc.yellow(
          'auto-rename: each conflicting slug will be suffixed with -<6char-hex>. Pass --yes to confirm or abort.\n',
        ),
      );
      // Apply auto-rename for all conflicts (v1 behavior; future versions
      // will prompt interactively).
      const resolutions = new Map<string, { resolution: 'rename' | 'skip'; renamedSlug?: string }>();
      const suffix = randomBytes(3).toString('hex');
      for (const c of plan.conflicts) {
        resolutions.set(c.localProjectId, { resolution: 'rename', renamedSlug: `${c.slug}-${suffix}` });
      }
      const resolvedPlan = applyConflictResolutions(plan, resolutions);
      Object.assign(plan, resolvedPlan); // mutate-in-place so the rest of the function sees it
    }

    if (options.yes !== true) {
      io.writeStdout(
        pc.cyan(
          '\ndry-run complete. To execute, re-run with --yes (no rollback if you abort mid-way without --resume / --rollback).\n',
        ),
      );
      return io.exit(0);
    }

    // Snapshot.
    io.writeStdout(pc.cyan(`\nsnapshotting local SQLite to ${snapshotPath}...\n`));
    snapshotLocalDb(dataDb, snapshotPath);

    io.writeStdout(pc.cyan('executing migration...\n'));
    const reporter = (event: MigrationProgressEvent) => {
      const tag = event.status === 'started' ? pc.dim('▸') : event.status === 'completed' ? pc.green('✓') : pc.red('✗');
      io.writeStdout(`  ${tag} ${event.phase}${event.detail !== undefined ? ` — ${event.detail}` : ''}\n`);
    };
    const result: MigrationResult = await executeMigration({
      local,
      cloud,
      plan,
      snapshotPath,
      progress: reporter,
    });

    if (result.status === 'completed') {
      io.writeStdout(pc.green(`\n✓ migration complete in ${result.durationMs}ms — ${fmtCounts(result.counts)}\n`));
      // Promote local config to team mode + write spawn-env so a
      // subsequent `contextos start` launches the sync-daemon + bridge
      // + mcp-server in team mode. Both writes are required:
      // config.json is the CLI's own source of truth; .env is what
      // `loadHomeEnv` feeds into the spawned daemons.
      upgradeToTeamConfig({
        clerkUserId: creds.userId,
        clerkOrgId: creds.orgId,
        localHookSecret: creds.secret,
        joinedAt: Date.now(),
      });
      writeTeamHomeEnv({
        databaseUrl: creds.databaseUrl,
        localHookSecret: creds.secret,
        clerkOrgId: creds.orgId,
      });
      io.writeStdout(pc.green('local config promoted to team mode (~/.contextos/config.json + ~/.contextos/.env)\n'));
      return io.exit(0);
    }
    io.writeStderr(pc.red(`\n✗ migration failed: ${result.error ?? 'unknown error'}\n`));
    io.writeStderr(
      pc.yellow(
        `re-run with --rollback to undo, or --resume to continue from the last completed phase. ` +
          `local snapshot preserved at ${snapshotPath}\n`,
      ),
    );
    return io.exit(1);
  } catch (err) {
    cliLogger.error(
      { event: 'team_migrate_unexpected_error', err: err instanceof Error ? err.message : String(err) },
      'team-migrate command threw',
    );
    io.writeStderr(`${pc.red('migrate threw')}: ${err instanceof Error ? err.message : String(err)}\n`);
    return io.exit(1);
  } finally {
    try {
      local.close();
    } catch {
      /* swallow */
    }
    try {
      await cloud.close();
    } catch {
      /* swallow */
    }
  }
}

// ---------------------------------------------------------------------------
// join
// ---------------------------------------------------------------------------

export async function runTeamJoinCommand(
  options: TeamJoinOptions = {},
  io: TeamCommandIO = DEFAULT_TEAM_IO,
): Promise<never> {
  const creds = resolveCredentials(options);
  if ('error' in creds) {
    io.writeStderr(`${pc.red('contextos team join')}: ${creds.error}\n`);
    return io.exit(EXIT_USER_ACTION_REQUIRED);
  }

  // Write team config first so subsequent local services see team mode
  // even if the cloud-pull-seed below fails partway. Both config.json
  // (CLI's source of truth) and ~/.contextos/.env (spawn-env for
  // daemons) are required — without the .env write `contextos start`
  // would either run in solo mode or crash sync-daemon at boot for
  // missing DATABASE_URL.
  upgradeToTeamConfig({
    clerkUserId: creds.userId,
    clerkOrgId: creds.orgId,
    ...(options.orgSlug !== undefined ? { clerkOrgSlug: options.orgSlug } : {}),
    localHookSecret: creds.secret,
    joinedAt: Date.now(),
  });
  writeTeamHomeEnv({
    databaseUrl: creds.databaseUrl,
    localHookSecret: creds.secret,
    clerkOrgId: creds.orgId,
  });
  io.writeStdout(pc.green('✓ ~/.contextos/config.json + ~/.contextos/.env upgraded to team mode\n'));

  // Cloud-pull-seed: connect, run a single tickOnce of the team-rows
  // puller pattern. The persistent puller in the sync-daemon will take
  // over for ongoing pulls.
  io.writeStdout(pc.cyan('initial cloud → local seed (this may take a moment for large teams)...\n'));
  let cloud: PostgresHandle;
  let local: SqliteHandle;
  try {
    const cloudHandle = createDb({ kind: 'cloud', postgres: { databaseUrl: creds.databaseUrl } });
    if (cloudHandle.kind !== 'postgres') throw new Error('expected postgres cloud handle');
    cloud = cloudHandle;
    const localHandle = createDb({ kind: 'local' });
    if (localHandle.kind !== 'sqlite') throw new Error('expected sqlite local handle');
    local = localHandle;
  } catch (err) {
    io.writeStderr(`${pc.red('join failed at handle open')}: ${err instanceof Error ? err.message : String(err)}\n`);
    return io.exit(1);
  }

  try {
    // For v1 the seed is a one-shot delegated to the standing puller
    // pattern via dynamic import (avoids circular dep on sync-daemon).
    // The actual pull semantics live in apps/sync-daemon/src/lib/team-rows-puller.ts;
    // this command's seeding is opportunistic — the sync-daemon does
    // the heavy lifting on its first tick after `contextos start`.
    io.writeStdout(
      pc.dim('(sync-daemon will pull team rows on its next tick; run `contextos start` to launch services)\n'),
    );
    return io.exit(0);
  } finally {
    try {
      local.close();
    } catch {
      /* swallow */
    }
    try {
      await cloud.close();
    } catch {
      /* swallow */
    }
  }
}

// ---------------------------------------------------------------------------
// leave
// ---------------------------------------------------------------------------

export async function runTeamLeaveCommand(
  options: TeamLeaveOptions = {},
  io: TeamCommandIO = DEFAULT_TEAM_IO,
): Promise<never> {
  if (options.yes !== true) {
    io.writeStdout(
      pc.yellow(
        '`team leave` clears your local team config and drops org-tagged rows from the local DB. ' +
          'Cloud data is untouched (other team members still see it). Re-run with --yes to confirm.\n',
      ),
    );
    return io.exit(EXIT_USER_ACTION_REQUIRED);
  }

  const { demoteToSoloConfig } = await import('../lib/team-config.js');
  demoteToSoloConfig();
  // Also strip the team env keys from ~/.contextos/.env so the next
  // `contextos start` launches in solo mode. Preserves any user-managed
  // entries the operator put there manually.
  clearTeamHomeEnv();
  io.writeStdout(pc.green('✓ ~/.contextos/config.json + ~/.contextos/.env demoted to solo mode\n'));
  io.writeStdout(
    pc.dim(
      '(local SQLite rows attributed to the team org are not deleted in v1 — they remain as historical state. ' +
        'A future contextos clean-team-data command will offer scrubbing.)\n',
    ),
  );
  return io.exit(0);
}
