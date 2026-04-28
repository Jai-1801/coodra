import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseDotenv } from 'dotenv';

/**
 * Reads `<contextosHome>/.env` and returns it as a plain dict. Used by
 * `services.ts::resolveServices` to seed the daemon's spawn env so the
 * solo-mode sentinels written by `contextos init` actually reach the
 * spawned process — pre-fix, `start` only forwarded vars that existed in
 * the parent shell, so `.env` was decorative and `CONTEXTOS_MODE=team`
 * silently fell back to the schema default 'solo'.
 *
 * Returns an empty record when the file is absent, unreadable, or
 * malformed — `start` should not fail because the operator hasn't yet
 * created an `.env`. Process.env is layered on top by the caller.
 */
export function loadHomeEnv(contextosHome: string): Record<string, string> {
  const path = join(contextosHome, '.env');
  let body: string;
  try {
    body = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  return parseDotenv(body);
}
