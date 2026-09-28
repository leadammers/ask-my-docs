import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export const DEMO_AUTH_STATE = 'playwright/.auth/demo.json';

// Locally, e2e needs values that must differ from normal dev (DEMO_PASSWORD
// for the setup test to type in, AI_PROVIDER=mock so a real Gemini key in
// .env.local is never called) — kept in .env.test.local, gitignored, copied
// from .env.test.example. Node doesn't override already-set process.env vars
// from a later file load, so this wins over whatever `pnpm dev` itself would
// read from .env.local. CI sets the same values as job env vars instead.
if (existsSync('.env.test.local')) process.loadEnvFile('.env.test.local');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Locally the webServer is `next dev`, which compiles routes on demand and
  // shares one local Supabase across the run. At the default (half the cores,
  // 8 here) the ingest tests time out waiting for a source to reach Ready and
  // the failures land on whichever specs happen to overlap — including ones
  // untouched by the change under test. CI runs against `next build && next
  // start`, so it keeps the default.
  workers: process.env.CI ? undefined : 4,
  reporter: [['html', { open: 'never' }]],
  // A fresh context's first paint is gated on an anonymous sign-in and then a
  // reload. Locally that runs against `next dev` with every spec compiling
  // routes at once, so the default 5s is routinely too short even though the
  // flow works — a genuinely broken one still fails, just after 15s.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: DEMO_AUTH_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: process.env.CI ? { SKIP_ENV_VALIDATION: '1' } : {},
    timeout: 120_000,
  },
});
