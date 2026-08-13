import { eq } from "drizzle-orm";

import { apiRoute, created, newId, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { formatMonth } from "@/lib/dates";
import { db } from "@/lib/db";
import { actuals, categories, periodLocks } from "@/lib/db/schema";
import { ValidationError } from "@/lib/errors";
import type { CsvRowError } from "@/lib/calc/planner";
import { parseActualsCsv } from "@/lib/calc/planner";
import { importActualsSchema } from "@/lib/validation/planner";

// CSV import for actuals. The client sends raw CSV text — parsing and
// validation happen entirely on the server, since it's the source of truth
// for the category names and lock state the rows are checked against.
//
// All-or-nothing: parse errors and locked-month rows are collected as
// per-row errors instead of one blanket 409, and if there are any, nothing
// gets written. A valid import inserts one row per line plus one audit
// entry, all in a single transaction.
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  const body = validate(importActualsSchema, await readJson(request));

  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, user.id));
  const categoriesByName = new Map(categoryRows.map((row) => [row.name, row]));

  const parsed = parseActualsCsv(body.csv, { categoriesByName });

  const lockRows = await db.select({ month: periodLocks.month }).from(periodLocks).where(eq(periodLocks.userId, user.id));
  const lockedMonths = new Set(lockRows.map((row) => row.month));

  const lockErrors: CsvRowError[] = parsed.rows
    .filter((row) => lockedMonths.has(row.month))
    .map((row) => ({
      row: row.row,
      message: `${formatMonth(row.month)} is locked. Unlock the period before importing actuals into it.`,
    }));

  const allErrors = [...parsed.errors, ...lockErrors].sort((a, b) => a.row - b.row);

  if (allErrors.length > 0) {
    throw new ValidationError(
      "CSV_IMPORT_FAILED",
      `The CSV had ${allErrors.length} invalid row${allErrors.length === 1 ? "" : "s"}. Nothing was imported.`,
      { rows: allErrors },
    );
  };

  return await db.transaction(async (tx) => {
    for (const row of parsed.rows) {
      await tx.insert(actuals).values({
        id: newId(),
        userId: user.id,
        categoryId: row.categoryId,
        month: row.month,
        amountMinorUnits: row.amountMinorUnits,
      });
    }

    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "actual",
      entityId: newId(),
      action: "actuals.imported",
      detail: {
        count: parsed.rows.length,
        rows: parsed.rows.map((row) => ({
          month: row.month,
          categoryId: row.categoryId,
          amountMinorUnits: row.amountMinorUnits,
        })),
      },
    });

    return created({ imported: parsed.rows.length });
  });
});
