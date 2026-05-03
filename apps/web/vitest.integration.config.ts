import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Integration test config — gated by env vars (LIVE_SUPABASE_TEST,
 * CLERK_LIVE_TEST). Tests skip silently when env is not flipped, so
 * CI runs them as no-ops. Local + nightly main-branch flips the gates
 * to exercise the live cloud + tenant.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['__tests__/integration/**/*.test.ts'],
    globals: false,
    typecheck: { enabled: false },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@/': new URL('./', import.meta.url).pathname,
    },
  },
});
