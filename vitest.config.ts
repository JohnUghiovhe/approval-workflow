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
  },
});
