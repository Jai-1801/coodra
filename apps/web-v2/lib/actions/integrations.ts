'use server';

import { homedir } from 'node:os';
import { detectIDE } from '@coodra/cli/lib/detect';
import { seedGraphifySeedPacksFeature } from '@coodra/cli/lib/init/graphify-feature';
import {
  DEFAULT_GRAPHIFY_GRAPH_PATH,
  DEFAULT_GRAPHIFY_PYTHON,
  unwireGraphify,
  wireGraphify,
} from '@coodra/cli/lib/init/graphify-wire';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { refuseInTeamHosted } from '@/lib/action-guards';

/**
 * `apps/web-v2/lib/actions/integrations.ts` — server actions for the
 * `/settings/integrations` Graphify card (Module 09, Track 9B / G4).
 *
 *   enableGraphifyAction(formData)  — wire Graphify's stdio MCP server
 *                                     into every agent config detected
 *                                     on this machine + seed the
 *                                     `graphify-seed-packs` skill.
 *   disableGraphifyAction(formData) — remove the `graphify` MCP entry
 *                                     from every detected agent config.
 *
 * Both wrap the 9·Core writers from `@coodra/cli` — the same idempotent,
 * never-clobber code the CLI's `coodra graphify` command runs. They
 * autodetect IDEs exactly like `coodra graphify enable` with no `--ide`.
 *
 * Deployment gate: `refuseInTeamHosted`. A deployed (team-hosted) web
 * server has no developer agent configs to write — wiring is a
 * local-laptop operation. The integrations page renders the
 * `coodra graphify enable` CLI command in that mode instead.
 */

const SLUG_RE = /^[a-z0-9_-]+$/;
const INTEGRATIONS_HREF = '/settings/integrations';

const GRAPHIFY_SCHEMA = z.object({
  projectSlug: z.string().min(1, 'projectSlug is required').regex(SLUG_RE, 'projectSlug is malformed'),
  cwd: z
    .string()
    .min(1, 'cwd is required')
    .refine((v) => v.startsWith('/'), 'cwd must be an absolute path'),
});

function firstZodMessage(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue === undefined ? 'invalid form data' : issue.message;
}

function errorHref(code: string, message: string): string {
  const search = new URLSearchParams();
  search.set('error', code);
  search.set('errorMessage', message);
  return `${INTEGRATIONS_HREF}?${search.toString()}`;
}

/**
 * Wire Graphify's MCP server into every detected agent config for one
 * project, then seed the `graphify-seed-packs` skill. Idempotent —
 * re-running is a no-op; a drifted entry is preserved (the CLI's
 * `--force` is the escape hatch, intentionally not exposed in the web).
 */
export async function enableGraphifyAction(formData: FormData): Promise<void> {
  refuseInTeamHosted('enableGraphifyAction');

  const parsed = GRAPHIFY_SCHEMA.safeParse({
    projectSlug: String(formData.get('projectSlug') ?? ''),
    cwd: String(formData.get('cwd') ?? ''),
  });
  if (!parsed.success) {
    redirect(errorHref('invalid_input', firstZodMessage(parsed.error)));
  }
  const { projectSlug, cwd } = parsed.data;
  const userHome = homedir();

  const detected = await detectIDE();
  if (detected.length === 0) {
    redirect(
      errorHref(
        'no_ide_detected',
        'No supported IDE (Claude Code, Cursor, Windsurf, Codex) was detected on this machine. Install one, then retry.',
      ),
    );
  }

  try {
    for (const ide of detected) {
      await wireGraphify({
        ide,
        cwd,
        userHome,
        python: DEFAULT_GRAPHIFY_PYTHON,
        graphPath: DEFAULT_GRAPHIFY_GRAPH_PATH,
        force: false,
        dryRun: false,
      });
    }
    await seedGraphifySeedPacksFeature({ cwd, projectSlug, force: false, dryRun: false });
  } catch (err) {
    redirect(errorHref('enable_failed', (err as Error).message));
  }

  redirect(`${INTEGRATIONS_HREF}?enabled=${encodeURIComponent(projectSlug)}`);
}

/**
 * Remove the `graphify` MCP entry from every detected agent config for
 * one project. Idempotent — a missing file or missing entry is a no-op.
 * The seeded `graphify-seed-packs` skill is left in place (it may carry
 * user edits) — remove it with `coodra feature remove` if wanted.
 */
export async function disableGraphifyAction(formData: FormData): Promise<void> {
  refuseInTeamHosted('disableGraphifyAction');

  const parsed = GRAPHIFY_SCHEMA.safeParse({
    projectSlug: String(formData.get('projectSlug') ?? ''),
    cwd: String(formData.get('cwd') ?? ''),
  });
  if (!parsed.success) {
    redirect(errorHref('invalid_input', firstZodMessage(parsed.error)));
  }
  const { projectSlug, cwd } = parsed.data;
  const userHome = homedir();

  const detected = await detectIDE();
  try {
    for (const ide of detected) {
      await unwireGraphify({ ide, cwd, userHome, dryRun: false });
    }
  } catch (err) {
    redirect(errorHref('disable_failed', (err as Error).message));
  }

  redirect(`${INTEGRATIONS_HREF}?disabled=${encodeURIComponent(projectSlug)}`);
}
