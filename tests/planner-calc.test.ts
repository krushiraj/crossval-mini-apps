import { describe, expect, it } from "vitest";

import { buildReport, computeVariance, parseActualsCsv } from "@/lib/calc/planner";
import type { ReportActual, ReportCategory, ReportPlan } from "@/lib/calc/planner";
import { MAX_MINOR_UNITS } from "@/lib/money";

// The worked sample table from the assignment brief.
const CATEGORIES: ReportCategory[] = [
  { id: "cat-marketing", name: "Marketing" },
  { id: "cat-payroll", name: "Payroll" },
];

const PLANS: ReportPlan[] = [
  { categoryId: "cat-marketing", month: "2026-01", amountMinorUnits: 500_000 },
  { categoryId: "cat-payroll", month: "2026-01", amountMinorUnits: 2_000_000 },
  { categoryId: "cat-marketing", month: "2026-02", amountMinorUnits: 500_000 },
  { categoryId: "cat-payroll", month: "2026-02", amountMinorUnits: 2_000_000 },
];

// Marketing Feb is intentionally omitted, matching the brief's CSV sample.
const ACTUALS: ReportActual[] = [
  { categoryId: "cat-marketing", month: "2026-01", amountMinorUnits: 480_000 },
  { categoryId: "cat-payroll", month: "2026-01", amountMinorUnits: 2_050_000 },
  { categoryId: "cat-payroll", month: "2026-02", amountMinorUnits: 1_980_000 },
];

describe("computeVariance", () => {
  it("2026-01 Marketing: plan 5,000 actual 4,800 -> -200 / -4.00%", () => {
    const result = computeVariance({ planMinorUnits: 500_000, actualMinorUnits: 480_000 });
    expect(result.varianceMinorUnits).toBe(-20_000);
    expect(result.variancePercent).toBe(-4);
  });

  it("2026-01 Payroll: plan 20,000 actual 20,500 -> +500 / +2.50%", () => {
    const result = computeVariance({ planMinorUnits: 2_000_000, actualMinorUnits: 2_050_000 });
    expect(result.varianceMinorUnits).toBe(50_000);
    expect(result.variancePercent).toBe(2.5);
  });

  it("2026-02 Marketing: plan 5,000, no actual logged -> nulls (rendered as —)", () => {
    const result = computeVariance({ planMinorUnits: 500_000, actualMinorUnits: null });
    expect(result.actualMinorUnits).toBeNull();
    expect(result.varianceMinorUnits).toBeNull();
    expect(result.variancePercent).toBeNull();
  });

  it("2026-02 Payroll: plan 20,000 actual 19,800 -> -200 / -1.00%", () => {
    const result = computeVariance({ planMinorUnits: 2_000_000, actualMinorUnits: 1_980_000 });
    expect(result.varianceMinorUnits).toBe(-20_000);
    expect(result.variancePercent).toBe(-1);
  });

  describe("plan = 0", () => {
    it("computes the variance amount but never a percent (no NaN/Infinity)", () => {
      const result = computeVariance({ planMinorUnits: 0, actualMinorUnits: 15_000 });
      expect(result.varianceMinorUnits).toBe(15_000);
      expect(result.variancePercent).toBeNull();
      expect(Number.isNaN(result.variancePercent)).toBe(false);
    });

    it("still returns nulls throughout when there is also no actual", () => {
      const result = computeVariance({ planMinorUnits: 0, actualMinorUnits: null });
      expect(result.actualMinorUnits).toBeNull();
      expect(result.varianceMinorUnits).toBeNull();
      expect(result.variancePercent).toBeNull();
    });
  });

  it("rounds variance percent to 2 decimal places", () => {
    // 100 / 300 = 33.333...%
    const result = computeVariance({ planMinorUnits: 300, actualMinorUnits: 400 });
    expect(result.variancePercent).toBe(33.33);
  });
});

describe("buildReport", () => {
  const report = buildReport({
    categories: CATEGORIES,
    plans: PLANS,
    actuals: ACTUALS,
    fromMonth: "2026-01",
    toMonth: "2026-02",
  });

  it("reproduces the assignment's sample table exactly", () => {
    const marketingJan = report.rows.find((r) => r.categoryId === "cat-marketing" && r.month === "2026-01");
    expect(marketingJan).toMatchObject({
      planMinorUnits: 500_000,
      actualMinorUnits: 480_000,
      varianceMinorUnits: -20_000,
      variancePercent: -4,
    });

    const payrollJan = report.rows.find((r) => r.categoryId === "cat-payroll" && r.month === "2026-01");
    expect(payrollJan).toMatchObject({
      planMinorUnits: 2_000_000,
      actualMinorUnits: 2_050_000,
      varianceMinorUnits: 50_000,
      variancePercent: 2.5,
    });

    const marketingFeb = report.rows.find((r) => r.categoryId === "cat-marketing" && r.month === "2026-02");
    expect(marketingFeb).toMatchObject({
      planMinorUnits: 500_000,
      actualMinorUnits: null,
      varianceMinorUnits: null,
      variancePercent: null,
    });

    const payrollFeb = report.rows.find((r) => r.categoryId === "cat-payroll" && r.month === "2026-02");
    expect(payrollFeb).toMatchObject({
      planMinorUnits: 2_000_000,
      actualMinorUnits: 1_980_000,
      varianceMinorUnits: -20_000,
      variancePercent: -1,
    });
  });

  it("sorts rows by category name then month", () => {
    const ordering = report.rows.map((r) => `${r.categoryName}:${r.month}`);
    expect(ordering).toEqual([
      "Marketing:2026-01",
      "Marketing:2026-02",
      "Payroll:2026-01",
      "Payroll:2026-02",
    ]);
  });

  it("omits category-months with neither a plan nor an actual", () => {
    const onlyPlanned: ReportPlan[] = [{ categoryId: "cat-marketing", month: "2026-01", amountMinorUnits: 100 }];
    const result = buildReport({
      categories: CATEGORIES,
      plans: onlyPlanned,
      actuals: [],
      fromMonth: "2026-01",
      toMonth: "2026-02",
    });
    expect(result.rows).toHaveLength(1);
  });

  it("sums multiple actual rows for the same category-month", () => {
    const splitActuals: ReportActual[] = [
      { categoryId: "cat-marketing", month: "2026-01", amountMinorUnits: 200_000 },
      { categoryId: "cat-marketing", month: "2026-01", amountMinorUnits: 280_000 },
    ];
    const result = buildReport({
      categories: CATEGORIES,
      plans: PLANS,
      actuals: splitActuals,
      fromMonth: "2026-01",
      toMonth: "2026-01",
    });
    const row = result.rows.find((r) => r.categoryId === "cat-marketing" && r.month === "2026-01");
    expect(row?.actualMinorUnits).toBe(480_000);
  });

  it("computes monthly totals across categories", () => {
    const jan = report.monthTotals.find((m) => m.month === "2026-01");
    expect(jan?.planMinorUnits).toBe(2_500_000); // 5,000 + 20,000
    expect(jan?.actualMinorUnits).toBe(2_530_000); // 4,800 + 20,500
    expect(jan?.varianceMinorUnits).toBe(30_000);

    const feb = report.monthTotals.find((m) => m.month === "2026-02");
    expect(feb?.planMinorUnits).toBe(2_500_000);
    // Marketing Feb has no actual, but Payroll Feb does — the total still sums what exists.
    expect(feb?.actualMinorUnits).toBe(1_980_000);
  });

  it("computes an overall total across the whole range", () => {
    expect(report.overallTotal.planMinorUnits).toBe(5_000_000);
    expect(report.overallTotal.actualMinorUnits).toBe(4_510_000);
  });

  it("returns an empty report for a range with no data", () => {
    const empty = buildReport({
      categories: CATEGORIES,
      plans: [],
      actuals: [],
      fromMonth: "2026-06",
      toMonth: "2026-06",
    });
    expect(empty.rows).toEqual([]);
    expect(empty.overallTotal.planMinorUnits).toBe(0);
    expect(empty.overallTotal.actualMinorUnits).toBeNull();
  });
});

describe("parseActualsCsv", () => {
  const categoriesByName = new Map(
    CATEGORIES.map((category) => [category.name, category]),
  );

  it("parses the brief's sample CSV (happy path)", () => {
    const csv = [
      "month,category,amount",
      "2026-01,Marketing,4800",
      "2026-01,Payroll,20500",
      "2026-02,Payroll,19800",
    ].join("\n");

    const result = parseActualsCsv(csv, { categoriesByName });

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      row: 1,
      categoryId: "cat-marketing",
      month: "2026-01",
      amountMinorUnits: 480_000,
    });
    expect(result.rows[1].amountMinorUnits).toBe(2_050_000);
    expect(result.rows[2].amountMinorUnits).toBe(1_980_000);
  });

  it("matches category names case-insensitively", () => {
    const csv = "month,category,amount\n2026-01,marketing,100.50";
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.errors).toEqual([]);
    expect(result.rows[0].categoryId).toBe("cat-marketing");
    expect(result.rows[0].amountMinorUnits).toBe(10_050);
  });

  it("works without a header row", () => {
    const csv = "2026-01,Marketing,100";
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it("collects a specific, row-numbered error for a bad month", () => {
    const csv = "month,category,amount\n2026-13,Marketing,100";
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ row: 1, message: expect.stringContaining("Invalid month") }]);
  });

  it("collects a specific, row-numbered error for an unknown category", () => {
    const csv = "month,category,amount\n2026-01,Snacks,100";
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.errors).toEqual([{ row: 1, message: expect.stringContaining("Unknown category") }]);
  });

  it("collects a specific, row-numbered error for a negative or malformed amount", () => {
    const csv = ["month,category,amount", "2026-01,Marketing,-50", "2026-01,Payroll,abc"].join("\n");
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ row: 1, message: expect.stringContaining("Invalid amount") });
    expect(result.errors[1]).toMatchObject({ row: 2, message: expect.stringContaining("Invalid amount") });
  });

  it("reports every bad row, not just the first (all-or-nothing import relies on this)", () => {
    const csv = [
      "month,category,amount",
      "2026-01,Marketing,4800", // valid
      "bad-month,Marketing,100", // invalid month
      "2026-01,Unknown,100", // invalid category
    ].join("\n");
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((e) => e.row)).toEqual([2, 3]);
    // Even though row 1 was valid, the caller is expected not to write anything
    // when errors is non-empty — that policy lives in the API route, not here.
    expect(result.rows).toHaveLength(1);
  });

  it("rejects an amount above the cap the API enforces", () => {
    const csv = "month,category,amount\n2026-01,Marketing,2000000000\n";
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ row: 1, message: expect.stringContaining("too large") }]);
  });

  it("accepts an amount exactly at the cap", () => {
    const csv = "month,category,amount\n2026-01,Marketing,10000000\n";
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.errors).toEqual([]);
    expect(result.rows[0].amountMinorUnits).toBe(MAX_MINOR_UNITS);
  });

  it("flags rows with the wrong number of columns", () => {
    const csv = "month,category,amount\n2026-01,Marketing";
    const result = parseActualsCsv(csv, { categoriesByName });
    expect(result.errors).toEqual([{ row: 1, message: expect.stringContaining("3 columns") }]);
  });

  it("reports an empty file as a single error", () => {
    const result = parseActualsCsv("", { categoriesByName });
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ row: 0, message: "The CSV file is empty." }]);
  });
});

describe("csv rows with quotes", () => {
  const categories = new Map([
    ["Marketing, Inc", { id: "c1", name: "Marketing, Inc" }],
    ["Payroll", { id: "c2", name: "Payroll" }],
  ]);

  it("keeps a comma inside a quoted category name", () => {
    const result = parseActualsCsv('month,category,amount\n2026-01,"Marketing, Inc",100', {
      categoriesByName: categories,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.categoryId).toBe("c1");
    expect(result.rows[0]?.amountMinorUnits).toBe(10_000);
  });

  it("reads a doubled quote as one quote", () => {
    const withQuote = new Map([['The "Big" One', { id: "c3", name: 'The "Big" One' }]]);
    const result = parseActualsCsv('month,category,amount\n2026-01,"The ""Big"" One",50', {
      categoriesByName: withQuote,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.categoryId).toBe("c3");
  });

  it("still reads unquoted rows", () => {
    const result = parseActualsCsv("month,category,amount\n2026-01,Payroll,200", {
      categoriesByName: categories,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.categoryId).toBe("c2");
  });
});
