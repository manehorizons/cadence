import { defineConfig, mergeConfig } from 'vitest/config';
import shared from './vitest.shared';

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['packages/*/tests/**/*.test.ts'],
      coverage: {
        reporter: ['text', 'html'],
        include: ['packages/*/src/**'],
      },
    },
  }),
);
