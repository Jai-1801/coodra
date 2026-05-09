export {
  createAnonymousAuthClient,
  createAuthClient,
  createClerkAuthClient,
  createSoloAuthClient,
  SOLO_IDENTITY,
  verifyClerkJwt,
  verifyLocalHookSecret,
} from './auth.js';
export {
  type Actor,
  assertCanEdit,
  assertCanResumeKillSwitch,
  hasRole,
  parseClerkRole,
  requireRole,
  type Role,
  ROLES,
  SOLO_ACTOR,
} from './roles.js';
export type { AuthClient, AuthEnv, Identity } from './types.js';
