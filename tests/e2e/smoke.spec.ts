import { expect, test } from "@playwright/test";

test.describe("layout", () => {
  // A wide table scrolls inside its own container. The page itself must never
  // scroll sideways, and columns must never be squeezed to fit.
  for (const path of ["/pricing", "/orders", "/planner", "/planner/report"]) {
    test(`${path} does not overflow sideways on a narrow screen`, async ({ page }) => {
      await page.setViewportSize({ width: 700, height: 900 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows).toBe(false);
    });
  }
});

// Smoke coverage across the three apps, run against the seeded demo account
// (`yarn db:seed`). These assert the numbers from the assignment briefs
// actually reach the screen, and that server-side guards surface to the user.
//
// The session comes from the `setup` project — see playwright.config.ts.

test.describe("landing", () => {
  test("links to all three apps", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Three mini full-stack apps" })).toBeVisible();
    for (const name of [
      "Multi-Rate Pricing Calculator",
      "Orders and Settlements",
      "Plan vs Actual Tracker",
    ]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
  });
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("protected pages redirect to the login screen", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/login\?next=%2Fpricing/);
  });
});

test.describe("pricing", () => {
  test("the sample document shows the totals from the brief", async ({ page }) => {
    await page.goto("/pricing");

    const row = page.getByRole("row", { name: /Sample document from the brief/ });
    await expect(row).toContainText("$421.50");
    await row.getByRole("link").first().click();

    // Per-line totals: 189.00 / 52.50 / 180.00
    await expect(page.getByRole("cell", { name: "$189.00", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "$52.50", exact: true })).toBeVisible();

    // Document totals: subtotal 450.00, discount 40.00, tax 11.50, grand 421.50
    const main = page.getByRole("main");
    await expect(main).toContainText("$450.00");
    await expect(main).toContainText("$11.50");
    await expect(main).toContainText("$421.50");
  });

  test("line totals show as you type, before anything is saved", async ({ page }) => {
    await page.goto("/pricing");
    await page
      .getByRole("row", { name: /Sample document from the brief/ })
      .getByRole("link")
      .first()
      .click();

    const row = page.locator("tbody tr").first();
    await row.getByRole("textbox").nth(1).fill("20");
    await row.getByRole("textbox").nth(2).fill("130.00");
    await row.getByRole("combobox").selectOption("percent");
    await row.getByRole("textbox").nth(3).fill("10");
    await row.getByRole("textbox").nth(4).fill("5");
    await row.getByRole("textbox").nth(4).blur();

    // 20 x 130.00 = 2,600.00, less 10% = 2,340.00, plus 5% tax = 2,457.00
    await expect(row).toContainText("$2,600.00");
    await expect(row).toContainText("$260.00");
    await expect(row).toContainText("$117.00");
    await expect(row).toContainText("$2,457.00");
  });

  test("pressing Enter in a line field saves instead of leaving the page", async ({ page }) => {
    await page.goto("/pricing");
    await page
      .getByRole("row", { name: /Sample document from the brief/ })
      .getByRole("link")
      .first()
      .click();

    await page.waitForURL(/\/pricing\/.+/);
    const url = page.url();
    const taxField = page.locator("tbody tr").first().getByRole("textbox").last();
    await taxField.fill("6");
    await taxField.press("Enter");

    await expect(page.getByText(/line items saved/i)).toBeVisible();
    expect(page.url()).toBe(url);
  });

  test("finalizing saves unsaved lines instead of dropping them", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/pricing");

    // Its own document, so the shared fixtures stay as they are.
    const id = await page.evaluate(async () => {
      const response = await fetch("/api/pricing/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "E2E finalize",
          customer: "E2E",
          issueDate: "2026-01-15",
          lines: [
            {
              description: "Widget",
              quantity: 1,
              unitPriceMinorUnits: 10000,
              discountType: null,
              discountValue: 0,
              taxRateBasisPoints: 0,
            },
          ],
        }),
      });
      const data = await response.json();
      return (data.document ?? data).id as string;
    });

    await page.goto(`/pricing/${id}`);
    await page.getByRole("button", { name: "Add line" }).click();

    const newRow = page.locator("tbody tr").last();
    await newRow.getByRole("textbox").nth(0).fill("Added but never saved");
    await newRow.getByRole("textbox").nth(1).fill("3");
    await newRow.getByRole("textbox").nth(2).fill("10.00");

    // Finalize without clicking Save changes first.
    await page.getByRole("button", { name: "Finalize" }).click();

    await expect(page.getByRole("main")).toContainText("Added but never saved");
    await expect(page.getByRole("main")).toContainText(/finalized/i);
  });

  test("a finalized document is read-only and offers duplication instead", async ({ page }) => {
    await page.goto("/pricing");

    await page
      .getByRole("row", { name: /Q1 platform retainer/ })
      .getByRole("link")
      .first()
      .click();

    await expect(page.getByRole("main")).toContainText(/finalized/i);
    await expect(page.getByRole("button", { name: /duplicate/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^finalize$/i })).toHaveCount(0);
  });
});

test.describe("orders", () => {
  test("the dashboard derives a status for every order", async ({ page }) => {
    await page.goto("/orders");

    await expect(page.getByRole("row", { name: /Acme Corp/ })).toContainText("Partially paid");
    await expect(page.getByRole("row", { name: /Northwind Trading/ })).toContainText("Paid");
    await expect(page.getByRole("row", { name: /Blue Harbour Logistics/ })).toContainText(
      "Overdue",
    );
    await expect(page.getByRole("row", { name: /Cedar & Co/ })).toContainText("Pending");
  });

  test("the status filter narrows the table", async ({ page }) => {
    await page.goto("/orders");

    await page.getByLabel("Filter by status").selectOption("overdue");
    await expect(page.getByRole("row", { name: /Blue Harbour Logistics/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Northwind Trading/ })).toHaveCount(0);
  });

  test("an over-payment is rejected with the maximum allowed amount", async ({ page }) => {
    await page.goto("/orders");

    // Acme Corp: $1,000 total with $400 recorded, so $600 remains due.
    await page.getByRole("row", { name: /Acme Corp/ }).getByRole("link").first().click();
    await expect(page.getByRole("main")).toContainText("$600.00");

    await page.getByLabel("Amount").fill("601");
    await page.getByRole("button", { name: /record payment/i }).click();

    // The server's actionable message must reach the user, not a generic failure.
    await expect(page.getByText(/maximum you can record is \$600\.00/i)).toBeVisible();
  });

  test("a valid partial payment updates the derived status", async ({ page }) => {
    await page.goto("/orders");

    await page.getByRole("row", { name: /Cedar & Co/ }).getByRole("link").first().click();
    await page.getByLabel("Amount").fill("200");
    await page.getByRole("button", { name: /record payment/i }).click();

    await expect(page.getByRole("main")).toContainText("Partially paid");
    await expect(page.getByRole("main")).toContainText("$2,000.00"); // $2,200 - $200 due
  });
});

test.describe("planner", () => {
  test("the report reproduces the sample variance table", async ({ page }) => {
    await page.goto("/planner/report");

    await page.locator('input[type="month"]').nth(0).fill("2026-01");
    await page.locator('input[type="month"]').nth(1).fill("2026-02");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByRole("row", { name: /Marketing Jan 2026/ })).toContainText("-4.00%");
    await expect(page.getByRole("row", { name: /Payroll Jan 2026/ })).toContainText("2.50%");
    await expect(page.getByRole("row", { name: /Payroll Feb 2026/ })).toContainText("-1.00%");

    // A missing actual shows as "—" rather than a fabricated -100%.
    const marketingFeb = page.getByRole("row", { name: /Marketing Feb 2026/ });
    await expect(marketingFeb).toContainText("$5,000.00");
    await expect(marketingFeb).toContainText("—");
    await expect(marketingFeb).not.toContainText("%");
  });

  test("a locked month is read-only", async ({ page }) => {
    await page.goto("/planner");

    // December 2025 is closed by the seed script.
    await page.locator('input[type="month"]').first().fill("2025-12");
    await expect(page.getByRole("button", { name: /unlock month/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add actual" })).toBeDisabled();
  });

  test("an unlocked month accepts a target", async ({ page }) => {
    await page.goto("/planner");

    await page.locator('input[type="month"]').first().fill("2026-07");
    const marketingTarget = page.getByRole("row", { name: /Marketing/ }).getByRole("textbox").first();

    const current = await marketingTarget.inputValue();
    await marketingTarget.fill(current.startsWith("4200") ? "4300.00" : "4200.00");
    await marketingTarget.press("Enter");

    await expect(page.getByText(/target saved/i).first()).toBeVisible();
  });
});
