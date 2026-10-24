import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
      '@contracts': fileURLToPath(new URL('../../docs/contracts/types.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/ui/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
  },
});
