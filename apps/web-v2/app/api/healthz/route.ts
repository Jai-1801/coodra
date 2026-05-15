import { NextResponse } from 'next/server';

import { resolveDeploymentMode } from '@/lib/deployment-mode';

/**
 * `/api/healthz` — process-supervisor probe.
 *
 * Public (no Clerk auth) so docker/vercel/fly healthchecks can hit it
 * without a session. Returns the deployment mode + a wall-clock
 * timestamp so an operator can confirm the right code is live.
 *
 * Does NOT probe DB connectivity — that's intentional. A healthz that
 * fails when Postgres is down would cause the supervisor to restart the
 * process unnecessarily; the symptom is "Postgres is down," not "web
 * app is broken." Use a separate liveness check for cloud DB if needed.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'web-v2',
    deploymentMode: resolveDeploymentMode(),
    timestamp: new Date().toISOString(),
  });
}
