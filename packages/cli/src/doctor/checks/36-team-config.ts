import { readTeamConfig, readTeamHomeEnv } from '../../lib/team-config.js';

import type { Check } from '../types.js';

/**
 * Module 04 Phase 4 — doctor check 36 — team-config well-formed.
 *
 * Validates the team-mode config block in `~/.contextos/config.json`:
 *   - solo mode  → green ('not in team mode' is a valid state)
 *   - team mode + complete block → green
 *   - team mode + missing fields → yellow (the `readTeamConfig` reader
 *     downgrades partial blocks to solo silently; this check surfaces
 *     them as triage info)
 *   - CONTEXTOS_MODE=team but config says solo → yellow (config out of
 *     sync with env; team-mode services will start without the actor
 *     identity layer; rows will be unattributed)
 *
 * The reader is permissive on read; this check is the strict
 * counterpart that tells the operator when their config is suspect.
 */
export const teamConfigCheck: Check = {
  id: 36,
  name: 'team-config block well-formed (Module 04 Phase 4)',
  severity: 'green-or-yellow',
  async run(ctx) {
    const cfg = readTeamConfig({ homeOverride: ctx.contextosHome });
    const envMode = ctx.env.CONTEXTOS_MODE ?? 'solo';

    if (cfg.mode === 'solo') {
      if (envMode === 'team') {
        return {
          status: 'yellow',
          detail:
            'CONTEXTOS_MODE=team but ~/.contextos/config.json::team is missing or partial — services will start ' +
            'without the actor identity layer; cross-team-member attribution will be NULL',
          remediation:
            'Run `contextos team join --user-id <id> --org-id <id> --secret <hex> --database-url <url>` to write ' +
            'the team block, or `contextos team setup` if you are the org admin doing first-time bootstrap.',
        };
      }
      return { status: 'green', detail: 'mode=solo (no team config required)' };
    }

    // Team mode — verify every required field is present + non-empty.
    const team = cfg.team;
    if (team === undefined) {
      return {
        status: 'yellow',
        detail: 'config mode=team but the team block was downgraded to solo by the reader (missing required fields)',
        remediation: 'Re-run `contextos team join` or `contextos team setup` to write a complete team block.',
      };
    }
    const missing: string[] = [];
    if (team.clerkUserId.length === 0) missing.push('clerkUserId');
    if (team.clerkOrgId.length === 0) missing.push('clerkOrgId');
    if (team.localHookSecret.length === 0) missing.push('localHookSecret');
    if (team.localHookSecret.length < 32) missing.push('localHookSecret (too short — must be ≥32 chars hex)');
    if (missing.length > 0) {
      return {
        status: 'yellow',
        detail: `team-config has weak fields: ${missing.join(', ')}`,
        remediation: 'Re-run `contextos team setup` to regenerate a fresh local hook secret + valid identity.',
      };
    }

    // Phase G+H — verify config.json and ~/.contextos/.env are in sync.
    // The daemons spawned by `contextos start` read from .env, so a
    // healthy config.json without matching .env entries means the next
    // `start` will run in solo mode (or crash sync-daemon for missing
    // DATABASE_URL). Surface this so the operator can re-run the
    // appropriate team command.
    const homeEnv = readTeamHomeEnv({ homeOverride: ctx.contextosHome });
    if (homeEnv === null) {
      return {
        status: 'yellow',
        detail:
          'config.json says team mode but ~/.contextos/.env is missing CONTEXTOS_MODE=team / DATABASE_URL / LOCAL_HOOK_SECRET — `contextos start` will run in solo mode',
        remediation:
          'Re-run `contextos team setup --database-url <url> --user-id <id> --org-id <id>` (admin) or `contextos team join …` (member) to refresh both config.json and .env in one step.',
      };
    }
    if (homeEnv.localHookSecret !== team.localHookSecret) {
      return {
        status: 'yellow',
        detail:
          'config.json::team.localHookSecret differs from ~/.contextos/.env::LOCAL_HOOK_SECRET — daemon-side stamping uses a different secret than the CLI thinks',
        remediation:
          'Re-run `contextos team setup` (admin) or `contextos team join` (member) to bring both in sync. Both writes happen in one command.',
      };
    }
    if (homeEnv.clerkOrgId !== team.clerkOrgId) {
      return {
        status: 'yellow',
        detail: 'config.json::team.clerkOrgId differs from ~/.contextos/.env::CONTEXTOS_TEAM_ORG_ID',
        remediation: 'Re-run `contextos team setup` / `team join` to align both files.',
      };
    }

    return {
      status: 'green',
      detail: `team mode wired (user=${team.clerkUserId.slice(0, 12)}…, org=${team.clerkOrgId.slice(0, 12)}…, joined ${new Date(team.joinedAt).toISOString().slice(0, 10)}, env synced)`,
    };
  },
};
