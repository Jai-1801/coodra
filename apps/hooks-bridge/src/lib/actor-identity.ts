import { readTeamConfig } from '@coodra/contextos-cli/lib/team-config';

/**
 * `apps/hooks-bridge/src/lib/actor-identity.ts` — Module 04 Phase 4.
 *
 * Reads the active human-actor identity for stamping `created_by_user_id`
 * on bridge writes. Solo mode → null (no human-user attribution; the
 * write either inserts NULL or, in the case of bridge_auto context_packs,
 * the `source` column already encodes provenance).
 *
 * Read-on-every-call rather than cache-at-boot for two reasons:
 *   1. `contextos team migrate` / `team join` / `team leave` write the
 *      config file from a different process. A long-lived bridge that
 *      cached at boot would serve stale identity until restart.
 *   2. The file is small (<1 KiB JSON) and the bridge's hook hot path
 *      already does dozens of disk operations per event; one more
 *      readSync is not measurable.
 *
 * Future optimization: TTL cache (5s) to amortize across hook bursts.
 * Wait until profiling shows it's needed.
 */

export interface ActorIdentity {
  readonly userId: string;
  readonly orgId: string;
}

export function getActorIdentity(): ActorIdentity | null {
  const cfg = readTeamConfig();
  if (cfg.mode !== 'team' || cfg.team === undefined) return null;
  return { userId: cfg.team.clerkUserId, orgId: cfg.team.clerkOrgId };
}
