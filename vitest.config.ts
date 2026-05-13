import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
  },
});
