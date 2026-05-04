import { StatusChip } from '@/components/StatusChip';
import {
  EmptyState,
  LinkButton,
  PageHeader,
  PageShell,
  Section,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { resolveProjectFromParams } from '@/lib/project-context';
import { listPolicies } from '@/lib/queries/policies';

/**
 * `/projects/[slug]/policies` — server-rendered policy list, scoped
 * to the URL-bound project (M04 Phase 2 S2a IA migration; restyled
 * in Phase 2 UI).
 */
export const dynamic = 'force-dynamic';

export default async function PoliciesListPage({ params }: { params: Promise<{ slug: string }> }) {
  const project = await resolveProjectFromParams(params);
  const policies = await listPolicies(project.id);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Project · governance"
        title="Policies"
        subtitle={
          <>
            Active rule sets evaluated by the bridge before every PreToolUse on{' '}
            <span className="font-mono">{project.slug}</span>.
          </>
        }
      />

      {policies.length === 0 ? (
        <EmptyState
          title="No policies on this project"
          body={
            <>
              Run <span className="font-mono">contextos init</span> in <span className="font-mono">{project.slug}</span>{' '}
              to seed the default policy set.
            </>
          }
        />
      ) : (
        <Section title="All policies" count={policies.length}>
          <Table>
            <THead>
              <TR hoverable={false}>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH align="right">Rules</TH>
                <TH>Updated</TH>
                <TH align="right">Open</TH>
              </TR>
            </THead>
            <TBody>
              {policies.map((policy) => (
                <TR key={policy.id}>
                  <TD mono>{policy.name}</TD>
                  <TD>
                    <StatusChip status={policy.isActive ? 'success' : 'neutral'}>
                      {policy.isActive ? 'active' : 'inactive'}
                    </StatusChip>
                  </TD>
                  <TD align="right" mono>
                    {policy.rules.length}
                  </TD>
                  <TD mono muted>
                    {policy.updatedAt.toISOString().slice(0, 19).replace('T', ' ')}
                  </TD>
                  <TD align="right">
                    <LinkButton
                      href={`/projects/${encodeURIComponent(project.slug)}/policies/${encodeURIComponent(policy.id)}`}
                      variant="ghost"
                      size="sm"
                    >
                      View
                    </LinkButton>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </PageShell>
  );
}
