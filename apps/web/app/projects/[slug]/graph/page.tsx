import Link from 'next/link';

import { resolveProjectFromParams } from '@/lib/project-context';
import { type GraphNodeProjection, loadGraph } from '@/lib/queries/graph';

/**
 * `/projects/[slug]/graph` — Codebase-graph reader (M04 Phase 2 S10).
 *
 * Reads `~/.contextos/graphify/<slug>/graph.json`. Per ADR-010, the
 * graphify producer is third-party — operators install it separately
 * and run `graphify scan` at the repo root to populate the index.
 *
 * Three render paths:
 *
 *   - `missing`  → empty-state CTA with the install + scan commands
 *                  + ADR-010 anchor reference. Operator's first
 *                  encounter with the page lives here.
 *   - `invalid`  → file exists but is malformed JSON / not the
 *                  expected shape. Surface the parse error so the
 *                  operator can act.
 *   - `ok`       → render a symbol search-table. Filter is server-
 *                  side via `?q=` querystring (substring match on
 *                  name + path). Per-row "view" expands the raw
 *                  JSON inside a <details> disclosure.
 *
 * No client JS — the filter, expand-detail, and reload all use the
 * URL or `<details>` HTML elements.
 */

export const dynamic = 'force-dynamic';

const PAGE_LIMIT = 200;

interface SearchParams {
  readonly q?: string;
  readonly community?: string;
}

export default async function GraphPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const project = await resolveProjectFromParams(params);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().toLowerCase();
  const community = (sp.community ?? '').trim();
  const result = loadGraph(project.slug);
  const baseHref = `/projects/${encodeURIComponent(project.slug)}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-black uppercase tracking-wide text-(--color-text-primary)">
          Codebase graph
        </h1>
        <p className="text-sm text-(--color-text-secondary)">
          Read-only view of <span className="font-mono">graph.json</span> for{' '}
          <span className="font-mono">{project.slug}</span> (ADR-010).
        </p>
      </header>

      {result.status === 'missing' ? (
        <EmptyState slug={project.slug} path={result.path} howToFix={result.howToFix} />
      ) : result.status === 'invalid' ? (
        <InvalidState path={result.path} reason={result.reason} />
      ) : (
        <Populated baseHref={baseHref} q={q} community={community} result={result} />
      )}
    </div>
  );
}

function Populated({
  baseHref,
  q,
  community,
  result,
}: {
  readonly baseHref: string;
  readonly q: string;
  readonly community: string;
  readonly result: {
    readonly path: string;
    readonly mtime: Date;
    readonly nodes: ReadonlyArray<GraphNodeProjection>;
    readonly edgeCount: number;
  };
}) {
  const filtered = result.nodes
    .filter((n) => (q.length === 0 ? true : `${n.name} ${n.path}`.toLowerCase().includes(q)))
    .filter((n) => (community.length === 0 ? true : n.community === community));
  const truncated = filtered.length > PAGE_LIMIT;
  const visible = truncated ? filtered.slice(0, PAGE_LIMIT) : filtered;
  const communities = uniqueCommunities(result.nodes);

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-3" action={`${baseHref}/graph`}>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-display font-bold uppercase tracking-wider text-(--color-text-secondary)">Search</span>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="symbol or path substring"
            className="w-72 border border-(--color-border-default) bg-(--color-bg-base) px-2 py-1.5 font-mono text-sm"
          />
        </label>
        {communities.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-display font-bold uppercase tracking-wider text-(--color-text-secondary)">
              Community
            </span>
            <select
              name="community"
              defaultValue={community}
              className="w-48 border border-(--color-border-default) bg-(--color-bg-base) px-2 py-1.5 font-mono text-sm"
            >
              <option value="">— any —</option>
              {communities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="submit"
          className="border border-(--color-border-default) bg-(--color-bg-base) px-4 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-(--color-text-primary) hover:border-(--color-brand) hover:text-(--color-brand)"
        >
          Filter
        </button>
        {q !== '' || community !== '' ? (
          <Link
            href={`${baseHref}/graph` as never}
            className="font-display text-xs font-bold uppercase tracking-wider text-(--color-text-secondary) hover:text-(--color-brand)"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-xs text-(--color-text-tertiary)">
        {result.nodes.length} nodes · {result.edgeCount} edges · {filtered.length} match
        {filtered.length === 1 ? '' : 'es'}
        {truncated ? ` (showing first ${PAGE_LIMIT})` : ''} · indexed{' '}
        <span className="font-mono">{result.mtime.toISOString()}</span>
      </p>

      {visible.length === 0 ? (
        <p className="border border-(--color-border-subtle) bg-(--color-bg-surface) p-6 text-center text-sm text-(--color-text-secondary)">
          No nodes match the filter.
        </p>
      ) : (
        <table className="w-full border border-(--color-border-subtle)">
          <thead className="bg-(--color-bg-elevated)">
            <tr>
              <Th>Name</Th>
              <Th>Kind</Th>
              <Th>Path</Th>
              <Th>Community</Th>
              <Th>Raw</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => (
              <tr
                key={n.id}
                className="border-b border-(--color-border-subtle) align-top hover:bg-(--color-bg-surface)"
              >
                <td className="px-3 py-2 font-mono text-sm text-(--color-text-primary)">{n.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-(--color-text-secondary)">{n.kind}</td>
                <td className="px-3 py-2 font-mono text-xs text-(--color-text-tertiary)">{n.path}</td>
                <td className="px-3 py-2 font-mono text-xs text-(--color-text-tertiary)">{n.community ?? '—'}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer font-display text-xs font-bold uppercase tracking-wider text-(--color-brand) hover:text-(--color-brand-hover)">
                      View
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre border border-(--color-border-subtle) bg-(--color-bg-base) p-2 font-mono text-[11px] text-(--color-text-primary)">
                      {JSON.stringify(n.raw, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-xs text-(--color-text-tertiary)">
        File: <span className="font-mono">{result.path}</span>
      </p>
    </div>
  );
}

function uniqueCommunities(nodes: ReadonlyArray<GraphNodeProjection>): string[] {
  const set = new Set<string>();
  for (const n of nodes) {
    if (n.community !== null) set.add(n.community);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function EmptyState({
  slug,
  path,
  howToFix,
}: {
  readonly slug: string;
  readonly path: string;
  readonly howToFix: string;
}) {
  return (
    <div className="flex flex-col gap-4 border border-(--color-border-subtle) bg-(--color-bg-surface) p-10">
      <div className="flex items-center gap-3">
        <span className="inline-block h-3 w-3 rounded-full bg-(--color-text-tertiary)" />
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-(--color-text-primary)">
          No graphify index yet
        </h2>
      </div>
      <p className="text-sm text-(--color-text-secondary)">
        ContextOS reads <span className="font-mono">graph.json</span> from <span className="font-mono">{path}</span>.
        The graphify CLI is third-party (ADR-010) — install it once, then scan from the repo root for{' '}
        <span className="font-mono">{slug}</span>.
      </p>
      <pre className="overflow-x-auto whitespace-pre border border-(--color-border-default) bg-(--color-bg-base) p-3 font-mono text-xs text-(--color-text-primary)">
        {howToFix}
      </pre>
      <p className="text-xs text-(--color-text-tertiary)">
        Once <span className="font-mono">graph.json</span> exists, this page renders the searchable symbol table — no
        re-render of ContextOS itself needed.
      </p>
    </div>
  );
}

function InvalidState({ path, reason }: { readonly path: string; readonly reason: string }) {
  return (
    <div className="flex flex-col gap-4 border border-(--color-status-error)/40 bg-(--color-bg-surface) p-10">
      <div className="flex items-center gap-3">
        <span className="inline-block h-3 w-3 rounded-full bg-(--color-status-error)" />
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-(--color-status-error)">
          graph.json is invalid
        </h2>
      </div>
      <p className="text-sm text-(--color-text-primary)">
        File at <span className="font-mono">{path}</span> exists but failed to parse.
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap border border-(--color-border-default) bg-(--color-bg-base) p-3 font-mono text-xs text-(--color-text-primary)">
        {reason}
      </pre>
      <p className="text-xs text-(--color-text-tertiary)">
        Re-run <span className="font-mono">graphify scan</span> from the repo root, or open{' '}
        <span className="font-mono">{path}</span> manually to inspect.
      </p>
    </div>
  );
}

function Th({ children }: { readonly children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-display text-xs font-bold uppercase tracking-wider text-(--color-text-secondary)">
      {children}
    </th>
  );
}
