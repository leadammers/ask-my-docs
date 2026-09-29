import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Integration tests run against the local Supabase stack (`pnpm db:start`)
// with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY set; `pnpm test` excludes them.
export default defineConfig({
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'test/empty-module.ts'),
      '@': __dirname,
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules/**', 'e2e/**'],
    env: { SKIP_ENV_VALIDATION: '1' },
    testTimeout: 30_000,
  },
});
