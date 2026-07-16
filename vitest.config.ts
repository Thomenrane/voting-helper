import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['data/src/**/*.test.ts', 'pipeline/src/**/*.test.ts', 'site/src/**/*.test.ts'],
  },
});
