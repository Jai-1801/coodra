import { Topbar } from '@/components/Topbar';

// W1 (2026-05-13) — opt out of static prerender. The root layout renders
// Sidebar (client), which calls useSearchParams(); Next.js's static
// generation of /_not-found fails the prerender without a Suspense
// boundary. Forcing dynamic skips the prerender entirely.
export const dynamic = 'force-dynamic';

export default function NotFoundPage() {
  return (
    <>
      <Topbar crumb="Not found" />
      <section className="screen">
        <div className="head">
          <div>
            <div className="head__num">/404</div>
            <h1 className="head__title">
              No <em>such</em> page.
            </h1>
            <p className="head__lede">The route you followed does not exist on this server.</p>
          </div>
        </div>
      </section>
    </>
  );
}
