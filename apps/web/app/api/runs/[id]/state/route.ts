import { NextResponse } from 'next/server';
import { runStateLastModified, serializeRunState } from '@/lib/queries/run-state';
import { getRun } from '@/lib/queries/runs';

/**
 * `GET /api/runs/[id]/state` — polling endpoint per spec §8 + OQ-2.
 *
 * Returns:
 *   - 404 when no run with id exists
 *   - 304 Not Modified (no body) when If-Modified-Since >= server's
 *     last-modified for the run snapshot
 *   - 200 OK + JSON body of {run, events, decisions, policyDecisions,
 *     contextPack} + Last-Modified header otherwise
 *
 * The Last-Modified value is the high-water-mark across run.startedAt /
 * run.endedAt + every related row's createdAt. RFC 7231 mandates
 * second-precision; we round down to the nearest second to avoid the
 * "client thinks it's already at HEAD but server has newer data with
 * sub-second timestamps" race.
 */

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const snapshot = await getRun(id);
  if (snapshot === null) {
    return NextResponse.json({ error: 'run_not_found', id }, { status: 404 });
  }

  // Round down to second precision (RFC 7231).
  const latestMs = Math.floor(runStateLastModified(snapshot).getTime() / 1000) * 1000;
  const lastModified = new Date(latestMs).toUTCString();

  const ims = request.headers.get('If-Modified-Since');
  if (ims !== null) {
    const imsParsed = Date.parse(ims);
    if (Number.isFinite(imsParsed) && imsParsed >= latestMs) {
      return new Response(null, { status: 304, headers: { 'Last-Modified': lastModified } });
    }
  }

  return NextResponse.json(serializeRunState(snapshot), {
    status: 200,
    headers: {
      'Last-Modified': lastModified,
      'Cache-Control': 'no-store',
    },
  });
}
