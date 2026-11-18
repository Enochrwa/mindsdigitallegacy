import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real website against the in-memory API (no database), the same setup as
 * "Path A" in docs/09-local-setup.md. Nothing here touches production data or real email.
 *
 *   bunx playwright install chromium     # once
 *   bun run e2e
 *
 * The in-memory API seeds a dev administrator (admin@example.rw) whose authenticator secret is fixed
 * and public in the repository (backend/src/testing/devServer.ts). It exists only in development.
 */
const WEB = "http://127.0.0.1:3000";
const API = "http://127.0.0.1:4000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // the in-memory API is one shared process; keep the order predictable
  workers: 1,
  // The dev server compiles each page the first time it is opened, so the first visit is slow.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env["CI"] ? 1 : 0,
  forbidOnly: Boolean(process.env["CI"]),
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev:memory",
      cwd: "../backend",
      url: `${API}/api/v1/health`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: { CORS_ORIGINS: WEB, LOG_LEVEL: "warn", HOST: "127.0.0.1" },
    },
    {
      command: "bun run dev --host 127.0.0.1",
      url: WEB,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: { VITE_API_BASE_URL: API },
    },
  ],
});
