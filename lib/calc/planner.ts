// No database or HTTP in here. That's what lets the tests reproduce the
// sample table from the brief without standing anything up.

import { isIsoMonth, monthsBetween } from "@/lib/dates";

export interface VarianceInput {
  planMinorUnits: number;
  // `null` means no actual was logged for this category-month.
  actualMinorUnits: number | null;
}

export interface Variance {
  planMinorUnits: number;
  actualMinorUnits: number | null;
  varianceMinorUnits: number | null;
  // Rounded to 2 decimal places. `null` when it cannot be computed.
  variancePercent: number | null;
}

// Nothing logged yet shows as "—" rather than 0. They're different facts, and
// treating them the same would show a made-up -100% for a month nobody has
// reported on.
//
// A plan of 0 gives no percentage — there isn't one — but the amount is still
// worked out. Variance is actual minus plan, so negative means under budget.
export const computeVariance = ({ planMinorUnits, actualMinorUnits }: VarianceInput): Variance => {
  if (actualMinorUnits === null) {
    return {
      planMinorUnits,
      actualMinorUnits: null,
      varianceMinorUnits: null,
      variancePercent: null,
    };
  }

  const varianceMinorUnits = actualMinorUnits - planMinorUnits;
  const variancePercent =
    planMinorUnits === 0 ? null : Math.round((varianceMinorUnits / planMinorUnits) * 100 * 100) / 100;

  return {
    planMinorUnits,
    actualMinorUnits,
    varianceMinorUnits,
    variancePercent,
  };
};

export interface ReportCategory {
  id: string;
  name: string;
}

export interface ReportPlan {
  categoryId: string;
  month: string;
  amountMinorUnits: number;
}

// There can be several of these per category-month. The report adds them up.
export interface ReportActual {
  categoryId: string;
  month: string;
  amountMinorUnits: number;
}

export interface ReportRow extends Variance {
  categoryId: string;
  categoryName: string;
  month: string;
}

export interface ReportMonthTotal {
  month: string;
  planMinorUnits: number;
  actualMinorUnits: number | null;
  varianceMinorUnits: number | null;
  variancePercent: number | null;
}

export interface Report {
  rows: ReportRow[];
  monthTotals: ReportMonthTotal[];
  overallTotal: ReportMonthTotal;
}

// A category-month with neither a plan nor an actual is left out entirely,
// rather than shown as a row of dashes for something that never existed.
export const buildReport = ({
  categories,
  plans,
  actuals,
  fromMonth,
  toMonth,
}: {
  categories: ReportCategory[];
  plans: ReportPlan[];
  actuals: ReportActual[];
  fromMonth: string;
  toMonth: string;
}): Report => {
  const months = monthsBetween(fromMonth, toMonth);
  const monthSet = new Set(months);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  const planByKey = new Map<string, number>();
  for (const plan of plans) {
    if (!monthSet.has(plan.month)) continue;
    planByKey.set(`${plan.categoryId}:${plan.month}`, plan.amountMinorUnits);
  };

  const actualSumByKey = new Map<string, number>();
  for (const actual of actuals) {
    if (!monthSet.has(actual.month)) continue;
    const key = `${actual.categoryId}:${actual.month}`;
    actualSumByKey.set(key, (actualSumByKey.get(key) ?? 0) + actual.amountMinorUnits);
  };

  const keys = new Set<string>([...planByKey.keys(), ...actualSumByKey.keys()]);

  const rows: ReportRow[] = [];
  for (const key of keys) {
    const [categoryId, month] = key.split(":");
    const category = categoriesById.get(categoryId);
    if (!category) continue; // Defensive: category deleted after the plan/actual was recorded.

    const planMinorUnits = planByKey.get(key) ?? 0;
    const actualMinorUnits = actualSumByKey.has(key) ? actualSumByKey.get(key)! : null;

    rows.push({
      categoryId,
      categoryName: category.name,
      month,
      ...computeVariance({ planMinorUnits, actualMinorUnits }),
    });
  };

  rows.sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.month.localeCompare(b.month));

  const monthTotals: ReportMonthTotal[] = months.map((month) => summarizeRows(month, rows));
  const overallTotal = summarizeRows(null, rows);

  return { rows, monthTotals, overallTotal };
};

// The total actual is only "—" when nothing at all was logged. A month with
// some categories filled in adds up what's there rather than giving up.
const summarizeRows = (month: string | null, rows: ReportRow[]): ReportMonthTotal => {
  const scoped = month === null ? rows : rows.filter((row) => row.month === month);

  const planMinorUnits = scoped.reduce((sum, row) => sum + row.planMinorUnits, 0);
  const anyActualLogged = scoped.some((row) => row.actualMinorUnits !== null);
  const actualMinorUnits = anyActualLogged
    ? scoped.reduce((sum, row) => sum + (row.actualMinorUnits ?? 0), 0)
    : null;

  const { varianceMinorUnits, variancePercent } = computeVariance({
    planMinorUnits,
    actualMinorUnits,
  });

  return {
    month: month ?? "all",
    planMinorUnits,
    actualMinorUnits,
    varianceMinorUnits,
    variancePercent,
  };
};

export interface ParsedActualRow {
  // Counts from 1, not counting the header, so errors match what they see.
  row: number;
  categoryId: string;
  categoryName: string;
  month: string;
  amountMinorUnits: number;
}

export interface CsvRowError {
  row: number;
  message: string;
}

export interface ParseActualsCsvResult {
  rows: ParsedActualRow[];
  errors: CsvRowError[];
}

const CSV_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

// Collects every bad row instead of stopping at the first, so someone fixing a
// file sees the whole list in one go.
//
// It only reports. Refusing to import when there are errors is the route's
// call, not the parser's.
// Handles quoted fields, so a category like "Marketing, Inc" survives.
const splitCsvRow = (line: string): string[] => {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
};

export const parseActualsCsv = (
  text: string,
  { categoriesByName }: { categoriesByName: Map<string, { id: string; name: string }> },
): ParseActualsCsvResult => {
  const lowerNameIndex = new Map<string, { id: string; name: string }>();
  for (const category of categoriesByName.values()) {
    lowerNameIndex.set(category.name.toLowerCase(), category);
  }

  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows: ParsedActualRow[] = [];
  const errors: CsvRowError[] = [];

  if (lines.length === 0) {
    return { rows, errors: [{ row: 0, message: "The CSV file is empty." }] };
  };

  const [header, ...dataLines] = lines;
  const headerCells = splitCsvRow(header).map((cell) => cell.toLowerCase());
  const hasHeader =
    headerCells.length === 3 && headerCells[0] === "month" && headerCells[1] === "category" && headerCells[2] === "amount";
  const bodyLines = hasHeader ? dataLines : lines;

  bodyLines.forEach((line, index) => {
    const rowNumber = index + 1;
    const cells = splitCsvRow(line);

    if (cells.length !== 3) {
      errors.push({
        row: rowNumber,
        message: `Expected 3 columns (month,category,amount), found ${cells.length}.`,
      });
      return;
    };

    const [month, categoryName, amountText] = cells;

    if (!isIsoMonth(month)) {
      errors.push({ row: rowNumber, message: `Invalid month "${month}". Expected format YYYY-MM.` });
      return;
    }

    const category = lowerNameIndex.get(categoryName.toLowerCase());
    if (!category) {
      errors.push({ row: rowNumber, message: `Unknown category "${categoryName}".` });
      return;
    };

    if (!CSV_AMOUNT_PATTERN.test(amountText)) {
      errors.push({
        row: rowNumber,
        message: `Invalid amount "${amountText}". Expected a non-negative number with up to 2 decimal places.`,
      });
      return;
    }

    const [whole, fraction = ""] = amountText.split(".");
    const amountMinorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

    rows.push({
      row: rowNumber,
      categoryId: category.id,
      categoryName: category.name,
      month,
      amountMinorUnits,
    });
  });

  return { rows, errors };
}
