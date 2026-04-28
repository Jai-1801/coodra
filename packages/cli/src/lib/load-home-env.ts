import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseDotenv } from 'dotenv';

/**
 * Reads the two dotenv files `contextos start` cares about and returns a
 * single merged dict. Used by `services.ts::resolveServices` to seed the
 * daemon's spawn env.
 *
 * Layering (low → high precedence):
 *   1. `<CONTEXTOS_HOME>/.env`  — user-global daemon defaults
 *   2. `<projectCwd>/.env`      — per-project overrides (this is where
 *                                 `contextos init` writes)
 *   3. process.env              — applied by the caller; always wins
 *
 * `<projectCwd>/.env` wins over `<CONTEXTOS_HOME>/.env` on conflict
 * because it's the more specific scope: a developer who sets
 * `CONTEXTOS_MODE=team` in their project should override whatever the
 * user-global default says.
 *
 * Pre-fix history: only `<CONTEXTOS_HOME>/.env` was read, so the .env
 * `init` writes (`<cwd>/.env`) was decorative end-to-end. Solo mode
 * survived only because `CONTEXTOS_MODE` defaults to `'solo'` in
 * `baseEnvSchema`; team-mode setups silently fell back to solo. Doctor
 * check 20 (`LOCAL_HOOK_SECRET present`) was YELLOW because the
 * `LOCAL_HOOK_SECRET` `init` wrote never reached the daemon either.
 *
 * Either file may be absent or unreadable — that's a no-op (empty dict
 * for that layer); `contextos start` must not fail just because the
 * operator hasn't run `init` yet, or hasn't customised either file.
 *
 * Function name kept as `loadHomeEnv` for source-grep continuity even
 * though it now reads two files; `projectCwd` is optional so existing
 * call sites that only need the home layer don't have to change.
 */
export function loadHomeEnv(contextosHome: string, projectCwd?: string): Record<string, string> {
  const home = readDotenvFile(join(contextosHome, '.env'));
  const project = projectCwd !== undefined ? readDotenvFile(join(projectCwd, '.env')) : {};
  return { ...home, ...project };
}

function readDotenvFile(path: string): Record<string, string> {
  let body: string;
  try {
    body = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  return parseDotenv(body);
}
