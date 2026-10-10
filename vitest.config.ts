import { defineConfig } from 'vitest/config';

// Plain config for unit tests and Node scripts: no IWSDK dev plugin.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
