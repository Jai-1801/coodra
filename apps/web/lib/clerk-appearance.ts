/**
 * `apps/web/lib/clerk-appearance.ts` — brand-styled Clerk appearance
 * prop per docs/feature-packs/04-web-app/wireframes/02-screens/auth.md.
 *
 * The most important override is `borderRadius: '0'` — Clerk's default
 * rounded corners would visibly conflict with the brand's zero-radius
 * mandate (per OQ-5 + brand.md). Color + font tokens flow from the
 * same CSS custom properties the rest of the app uses, so theme
 * changes here propagate everywhere.
 *
 * The `elements` overrides apply Tailwind utility classes to specific
 * Clerk-provided component slots for typography fidelity (Inter weight
 * 700–900 uppercase tracking-wider matches our nav/CTA pattern).
 */
// Structural type — `Appearance` from @clerk/types is a transitive
// dep we don't pull in directly. Clerk components accept any
// shape-compatible appearance object.
export const clerkAppearance = {
  variables: {
    colorPrimary: '#1c69d4',
    colorBackground: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#757575',
    colorInputBackground: '#f7f7fa',
    colorInputText: '#262626',
    colorDanger: '#ef4444',
    colorSuccess: '#22c55e',
    fontFamily: 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontFamilyButtons: 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif',
    borderRadius: '0',
    spacingUnit: '8px',
  },
  elements: {
    formButtonPrimary: 'uppercase tracking-wider font-bold',
    socialButtonsBlockButton: 'uppercase tracking-wider font-bold',
    formFieldLabel: 'uppercase tracking-wider font-bold text-xs',
    headerTitle: 'font-display font-black uppercase',
    rootBox: 'font-sans',
    card: 'border border-(--color-border-default) shadow-none',
  },
};
