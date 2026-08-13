import { expect, test } from "@playwright/test";

test.describe("layout", () => {
  // The page itself must never scroll sideways; a wide table scrolls inside its own container.
  const widths = [390, 700];
  const paths = [
    "/pricing",
    "/orders",
    "/planner",
    "/planner/report",
    "/planner/categories",
    "/pricing/new",
    "/orders/new",
  ];

  for (const path of paths) {
    for (const width of widths) {
      test(`${path} does not overflow sideways at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.waitForLoadState("networkidle");

        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        expect(overflows).toBe(false);
      });
    }
  }
});

// Requires the seeded demo account (`yarn db:seed`); session comes from the
// `setup` project in playwright.config.ts.

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

test.describe("session", () => {
  // Signs in by itself rather than reusing the shared session, because signing
  // out would invalidate it for every other spec.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("you can sign out from the landing page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@crossval.test");
    await page.getByLabel("Password").fill("demo12345");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // the session is really gone, not just the page changed
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/login\?next=%2Fpricing/);
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

  test("an out-of-range value marks its row and blocks saving", async ({ page }) => {
    await page.goto("/pricing");
    await page
      .getByRole("row", { name: /Sample document from the brief/ })
      .getByRole("link")
      .first()
      .click();

    const row = page.locator("tbody tr").first();
    await row.getByRole("textbox").last().fill("150");

    await expect(row).toHaveClass(/bg-red-200/);
    await expect(page.getByText("Tax percent must be between 0 and 100.").first()).toBeVisible();

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Line 1: Tax percent must be between 0 and 100/)).toBeVisible();
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

  test("a price it can't read blocks the save instead of storing zero", async ({ page }) => {
    await page.goto("/orders/new");
    await page.getByLabel("Customer").fill("Bad price test");
    await page.getByLabel("Due date").fill("2026-12-01");

    const row = page.locator("form").first();
    await row.getByLabel("Description").first().fill("Widget");
    await row.getByLabel("Quantity").first().fill("1");
    await row.getByLabel("Unit price").first().fill("7.777");

    await page.getByRole("button", { name: /create order/i }).click();

    await expect(page.getByText(/at most two decimal places/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/orders\/new/);
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

    await page.getByLabel("From month").selectOption({ label: "January" });
    await page.getByLabel("From year").selectOption("2026");
    await page.getByLabel("To month").selectOption({ label: "February" });
    await page.getByLabel("To year").selectOption("2026");
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
    await page.getByLabel("Month month").selectOption({ label: "December" });
    await page.getByLabel("Month year").selectOption("2025");
    await expect(page.getByRole("button", { name: /unlock month/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add actual" })).toBeDisabled();
  });

  test("a category with figures in a locked month cannot be deleted", async ({ page }) => {
    await page.goto("/planner/categories");
    page.on("dialog", (dialog) => dialog.accept());

    // Payroll has a December 2025 plan, and that month is closed.
    await page.getByRole("row", { name: /Payroll/ }).getByLabel("Delete").click();

    await expect(page.getByText(/Dec 2025.*locked/i).first()).toBeVisible();
    await expect(page.getByRole("row", { name: /Payroll/ })).toBeVisible();
  });

  test("an unlocked month accepts a target", async ({ page }) => {
    await page.goto("/planner");

    await page.getByLabel("Month month").selectOption({ label: "July" });
    await page.getByLabel("Month year").selectOption("2026");
    const marketingTarget = page.getByRole("row", { name: /Marketing/ }).getByRole("textbox").first();

    const current = await marketingTarget.inputValue();
    await marketingTarget.fill(current.startsWith("4200") ? "4300.00" : "4200.00");
    await marketingTarget.press("Enter");

    await expect(page.getByText(/target saved/i).first()).toBeVisible();
  });
});
