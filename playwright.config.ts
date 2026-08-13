import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

const STORAGE_STATE = path.join(process.cwd(), "playwright/.auth/user.json");

// The unit tests check the sums are right. These check the numbers reach the
// screen and that a refused write actually tells the user why.
//
// Signing in happens once in the setup project and is reused. Signing in per
// test hits the auth rate limit, and then you're debugging throttling instead
// of your app.
//
// Runs against its own database file, not the development one, and reseeds
// before every run. Sharing would make the tests depend on whatever state the
// app was left in, and would wipe your work.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `yarn build && yarn start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      BETTER_AUTH_URL: baseURL,
      TURSO_DATABASE_URL: "file:./e2e.db",
    },
  },
});
