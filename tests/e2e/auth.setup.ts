import path from "node:path";

import { expect, test as setup } from "@playwright/test";

// Signs in once and saves the session for every other spec to reuse.
//
// Signing in per test would be both slower and wrong: the auth endpoints are
// rate limited, so a suite that authenticates repeatedly starts failing on
// throttled requests rather than on real defects.

export const STORAGE_STATE = path.join(process.cwd(), "playwright/.auth/user.json");

const DEMO_EMAIL = "demo@crossval.test";
const DEMO_PASSWORD = "demo12345";

setup("authenticate as the demo user", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(DEMO_EMAIL);
  await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText(`Signed in as ${DEMO_EMAIL}`)).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
