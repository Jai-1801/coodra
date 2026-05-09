import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/integration/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    // Bumped 2026-05-09 from 30s for the team-end-to-end smoke test —
    // the team-bootstrap test runs a real Postgres bootstrap (DROP +
    // CREATE EXTENSION + 13 migrations + dozens of INSERTs across two
    // SQLite handles), which exceeds 30s on remote (Supabase) targets.
    // Local docker-compose Postgres runs in <10s; the higher cap
    // tolerates the network case without slowing the local case.
    testTimeout: 120_000,
    // hookTimeout is separate from testTimeout — the beforeAll that
    // wipes-and-re-migrates the cloud schema is the slow path; the test
    // bodies themselves are fast. Keep the same cap for both so any
    // single phase can take its time.
    hookTimeout: 120_000,
    // Several integration files (team-migrate.test.ts, team-end-to-end.test.ts,
    // dispatch.test.ts) point at the same DATABASE_URL and each does
    // a destructive `DROP TABLE … CASCADE` + `migratePostgres` in
    // beforeAll. Running them in parallel against one Supabase
    // schema makes them race — one drops mid-migration, the other
    // crashes with "table already exists". Force serial execution
    // for this suite. Fast-suites that don't touch a shared DB
    // can flip this back per-file via `pool: 'threads'` if needed.
    fileParallelism: false,
  },
});
