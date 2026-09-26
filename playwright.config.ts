import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export const DEMO_AUTH_STATE = "playwright/.auth/demo.json";

// Locally the setup test needs DEMO_PASSWORD, which `pnpm dev` reads from
// .env.local; CI passes it as a job env var instead.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: DEMO_AUTH_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: process.env.CI ? { SKIP_ENV_VALIDATION: "1" } : {},
    timeout: 120_000,
  },
});
