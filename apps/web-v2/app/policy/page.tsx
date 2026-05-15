// W2 (2026-05-13) — `/policy` is a UX alias for `/policies`. Folks
// type the singular all the time and a 404 on /policy is just hostile.
// Re-export the canonical page so both URLs render the exact same UI;
// keeps a single source of truth for the rules table + actions.
export { default, dynamic } from '../policies/page';
