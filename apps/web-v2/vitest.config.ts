import { defineConfig } from 'vitest/config';

/**
 * web-v2 unit-test config. Mirrors apps/web/vitest.config.ts. Pure
 * node environment — the tests we run here exercise lib/ helpers
 * (invite-token, public-url) that have zero DOM coupling. Tests that
 * need React DOM rendering can later add `@vitejs/plugin-react` +
 * `environment: 'happy-dom'` per the apps/web template.
 */
export default defineConfig({
  test: {
    include: ['__tests__/unit/**/*.test.ts', '__tests__/unit/**/*.test.tsx'],
    globals: false,
    typecheck: { enabled: false },
  },
  resolve: {
    alias: {
      '@/': new URL('./', import.meta.url).pathname,
      // `server-only` is a Next.js shim that throws at import time when
      // it ends up in a client bundle. In the Node test runner that
      // import is a no-op safeguard we don't want to fail on.
      'server-only': new URL('./__tests__/stubs/server-only.ts', import.meta.url).pathname,
    },
  },
});
