import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    pool: 'forks',
    // DB-backed tests share one Postgres test database (see test/helpers.ts)
    // and isolate via TRUNCATE — run files serially so they can't wipe each
    // other's data mid-test.
    fileParallelism: false,
  },
});
