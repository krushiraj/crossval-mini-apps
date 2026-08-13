import { and, eq, gte, lte } from "drizzle-orm";

import { apiRoute, ok, requireUser, validate } from "@/lib/api-utils";
import { buildReport } from "@/lib/calc/planner";
import { db } from "@/lib/db";
import { actuals, categories, plans } from "@/lib/db/schema";
import { reportQuerySchema } from "@/lib/validation/planner";

export const GET = apiRoute(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = validate(reportQuerySchema, Object.fromEntries(url.searchParams));

  const [categoryRows, planRows, actualRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, user.id)),
    db
      .select({ categoryId: plans.categoryId, month: plans.month, amountMinorUnits: plans.amountMinorUnits })
      .from(plans)
      .where(and(eq(plans.userId, user.id), gte(plans.month, query.from), lte(plans.month, query.to))),
    db
      .select({ categoryId: actuals.categoryId, month: actuals.month, amountMinorUnits: actuals.amountMinorUnits })
      .from(actuals)
      .where(and(eq(actuals.userId, user.id), gte(actuals.month, query.from), lte(actuals.month, query.to))),
  ]);

  const report = buildReport({
    categories: categoryRows,
    plans: planRows,
    actuals: actualRows,
    fromMonth: query.from,
    toMonth: query.to,
  });

  return ok(report);
});
