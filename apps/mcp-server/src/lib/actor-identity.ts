import { readTeamConfig } from '@coodra/contextos-cli/lib/team-config';

/**
 * `apps/mcp-server/src/lib/actor-identity.ts` — Module 04 Phase 4.
 *
 * Mirrors `apps/hooks-bridge/src/lib/actor-identity.ts` for the
 * MCP-tool write paths. Returns the active human-actor's Clerk user
 * id when `~/.contextos/config.json::mode === 'team'`; null otherwise.
 *
 * Why this is separate from `ctx.auth.getIdentity()`:
 *   - The auth client is for HTTP transport authentication (Clerk JWT
 *     verification at the MCP server boundary). In solo mode it
 *     returns the synthetic `user_dev_local` so the request layer can
 *     proceed; that synthetic id is NOT a real user and must not be
 *     stamped on writes.
 *   - This helper is for stamping `created_by_user_id` on writes.
 *     Solo + missing-team-config returns null → DB column written as
 *     NULL → web app correctly renders "no actor recorded".
 *
 * Reads on every call (rather than caching at boot) so a `contextos
 * team migrate` mid-session picks up the new identity without an MCP
 * server restart. Cost is one small JSON read per tool call — well
 * within the §6 50ms hot-path budget.
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
