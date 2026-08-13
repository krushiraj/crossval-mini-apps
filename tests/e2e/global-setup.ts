import { execFileSync } from "node:child_process";

export const E2E_DATABASE_URL = "file:./e2e.db";

// The specs assert on seeded numbers and several of them edit those rows, so
// without a reseed the second run fails on data the first run changed.
const globalSetup = (): void => {
  execFileSync("npx", ["tsx", "scripts/seed.ts"], {
    stdio: "inherit",
    env: { ...process.env, TURSO_DATABASE_URL: E2E_DATABASE_URL },
  });
};

export default globalSetup;
