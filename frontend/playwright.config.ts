import { defineConfig, devices } from "@playwright/test";

/**
 * The happy path runs against a real backend and a real model — nothing is mocked, because what
 * this test is for is proving the seams hold: upload, train, score, explain.
 *
 * Both servers are started here, with the API pointed at a scratch database and scratch artifact
 * directories so a test run can never touch the developer's own data.
 */
const E2E_STATE = ".e2e";

export default defineConfig({
  testDir: "./e2e",
  // Training a model is not a race worth running; one worker keeps the API's job runner honest.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `rm -rf ${E2E_STATE} && mkdir -p ${E2E_STATE} && uv run alembic upgrade head && uv run uvicorn app.main:app --host 127.0.0.1 --port 8100`,
      cwd: "../backend",
      url: "http://127.0.0.1:8100/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        CRIP_DATABASE_URL: `sqlite:///./${E2E_STATE}/e2e.db`,
        CRIP_UPLOAD_DIR: `./${E2E_STATE}/uploads`,
        CRIP_ARTIFACTS_DIR: `./${E2E_STATE}/artifacts`,
        CRIP_CORS_ORIGINS: "http://127.0.0.1:3100",
        CRIP_JOB_RUNNER_POLL_SECONDS: "0.5",
      },
    },
    {
      command: "pnpm next dev --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8100",
        NEXT_DIST_DIR: ".next-e2e",
      },
    },
  ],
});
