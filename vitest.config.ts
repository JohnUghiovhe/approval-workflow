import { defineConfig } from 'vitest/config';

// Run only the intended test roots. Without an explicit include, Vitest's
// default glob would also pick up compiled copies in dist/ after a build. The
// setup file pins NODE_ENV=test so the prisma client uses the dedicated test
// database; globalSetup provisions its schema when the test database is up.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/env-setup.ts'],
    globalSetup: ['tests/helpers/db.provision.ts'],
    // DB-backed suites share one test database and resetDatabase() clears
    // whole tables, so run files one at a time instead of in parallel.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      // Count only application code: generated Prisma client, test files, and
      // root config files never contribute to the report or the thresholds.
      exclude: [
        'src/generated/**',
        'src/**/*.test.ts',
        'src/**/tests/**',
        // Process bootstrap and the dev seed CLI: neither is exercised through
        // the test suite (server.ts is validated by `npm run build` and startup
        // probes, seed.ts by `npm run db:seed`), so counting their branches
        // would only penalize coverage without any test value.
        'src/server.ts',
        'src/database/seed.ts',
        'src/database/migrations/**',
        '**/*.prisma',
        'tests/**',
        'eslint.config.ts',
        'prisma.config.ts',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
