/**
 * `server-only` shim for Vitest. The real package (shipped by
 * `next` / `server-only` on npm) throws at import time if a client
 * bundle accidentally pulls it in. In our Node-side unit tests we
 * always want the import to be a silent no-op so we can exercise
 * server-only modules directly.
 */
export {};
