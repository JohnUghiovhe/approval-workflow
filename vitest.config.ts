import { defineConfig } from 'vitest/config';

// Run only the intended test roots. Without an explicit include, Vitest's
// default glob would also pick up compiled copies in dist/ after a build.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
