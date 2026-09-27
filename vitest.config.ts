import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'test/empty-module.ts'),
      '@': __dirname,
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['node_modules/**', 'e2e/**'],
    env: { SKIP_ENV_VALIDATION: '1' },
  },
});
