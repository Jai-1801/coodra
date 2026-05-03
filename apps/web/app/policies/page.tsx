import Link from 'next/link';

import { StatusChip } from '@/components/StatusChip';
import { listPolicies } from '@/lib/queries/policies';
import { listProjectsForFilter } from '@/lib/queries/runs';

/**
 * `/policies` — server-rendered policy list per
 * `docs/feature-packs/04-web-app/wireframes/02-screens/policies.md`.
 *
 * URL filter: ?project=<projectId>
 */

interface SearchParams {
  readonly project?: string;
}

export default async function PoliciesListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const projectId = params.project !== undefined && params.project !== '' ? params.project : null;
  const [policies, projects] = await Promise.all([listPolicies(projectId), listProjectsForFilter()]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-black uppercase tracking-wide">Policies</h1>
        <p className="text-sm text-(--color-text-secondary)">
          Active rule sets evaluated by the bridge before every PreToolUse.
        </p>
      </header>

      <form className="flex flex-wrap gap-4 border border-(--color-border-subtle) bg-(--color-bg-surface) p-4">
        <label className="flex flex-col gap-1">
          <span className="font-display text-xs font-bold uppercase tracking-wider text-(--color-text-secondary)">
            Project
          </span>
          <select
            name="project"
            defaultValue={params.project ?? ''}
            className="border border-(--color-border-default) bg-(--color-bg-base) px-3 py-2 font-sans text-sm text-(--color-text-primary)"
          >
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.slug}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-end bg-(--color-brand) px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-white hover:bg-(--color-brand-hover)"
        >
          Apply
        </button>
        {params.project !== undefined && params.project !== '' ? (
          <Link
            href="/policies"
            className="self-end border border-(--color-border-default) px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-(--color-text-primary) hover:border-(--color-brand) hover:text-(--color-brand)"
          >
            Reset
          </Link>
        ) : null}
      </form>

      {policies.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="w-full border border-(--color-border-subtle)">
          <thead className="bg-(--color-bg-elevated)">
            <tr>
              <Th>Name</Th>
              <Th>Project</Th>
              <Th>Status</Th>
              <Th>Rules</Th>
              <Th>Updated</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id} className="border-b border-(--color-border-subtle) hover:bg-(--color-bg-surface)">
                <td className="px-3 py-3 font-mono text-sm font-medium text-(--color-text-code)">{policy.name}</td>
                <td className="px-3 py-3 font-mono text-xs text-(--color-text-tertiary)">{policy.projectId}</td>
                <td className="px-3 py-3">
                  <StatusChip status={policy.isActive ? 'success' : 'neutral'}>
                    {policy.isActive ? 'active' : 'inactive'}
                  </StatusChip>
                </td>
                <td className="px-3 py-3 font-mono text-sm">{policy.rules.length}</td>
                <td className="px-3 py-3 font-mono text-xs text-(--color-text-tertiary)">
                  {policy.updatedAt.toISOString().slice(0, 19).replace('T', ' ')}
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/policies/${encodeURIComponent(policy.id)}` as never}
                    className="font-display text-xs font-bold uppercase tracking-wider text-(--color-brand) hover:text-(--color-brand-hover)"
                  >
                    View ▸
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

function EmptyState() {
  return (
    <div className="border border-(--color-border-subtle) bg-(--color-bg-surface) p-12 text-center">
      <p className="font-display text-lg font-light uppercase tracking-wider text-(--color-text-secondary)">
        No policies match the current filter.
      </p>
      <p className="mt-2 text-sm text-(--color-text-tertiary)">
        Run `contextos init` in a project to seed the default policy set.
      </p>
    </div>
  );
}
