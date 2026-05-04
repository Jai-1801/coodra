import { readProjectExport } from '@/lib/queries/projects';

/**
 * `/projects/[slug]/settings/export` — JSONL stream of every per-
 * project audit row (M04 Phase 2 S14).
 *
 * One JSON object per line, tagged by `type`:
 *   {"type":"project","data":{...}}
 *   {"type":"run","data":{...}}
 *   {"type":"run_event","data":{...}}
 *   {"type":"decision","data":{...}}
 *   {"type":"policy_decision","data":{...}}
 *   {"type":"context_pack","data":{...}}
 *
 * Content-Disposition: attachment so browsers download the file
 * rather than rendering it.
 *
 * Memory profile: the helper materialises all rows in-process before
 * emitting; for projects with thousands of run_events that's still
 * well under typical Next.js memory limits. A streaming variant can
 * land later if a single project ever exceeds the 50MB-ish limit.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const rows = await readProjectExport(decoded);
  if (rows.length === 0) {
    return new Response(`project "${decoded}" not found or empty`, { status: 404 });
  }
  // JSONL: one object per line, no trailing newline.
  const body = rows.map((r) => JSON.stringify(r)).join('\n');
  const filename = `${decoded}-export-${new Date().toISOString().slice(0, 10)}.jsonl`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
