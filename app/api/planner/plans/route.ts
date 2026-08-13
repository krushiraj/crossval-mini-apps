import { and, eq, gte, lte } from "drizzle-orm";

import { apiRoute, newId, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { categories, plans } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/errors";
import { plansQuerySchema, upsertPlanSchema } from "@/lib/validation/planner";
import { assertMonthUnlocked } from "@/app/api/planner/_lib";

export const GET = apiRoute(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = validate(plansQuerySchema, Object.fromEntries(url.searchParams));

  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, user.id), gte(plans.month, query.from), lte(plans.month, query.to)));

  return ok({ plans: rows });
});

// Upserts by (categoryId, month); the unique index
// plans_user_category_month_idx backs this at the DB level. We still
// select-then-write inside a transaction rather than relying on
// onConflictDoUpdate, so both branches can attach the pre-update state to
// the audit entry the same way.
export const PUT = apiRoute(async (request) => {
  const user = await requireUser();
  const body = validate(upsertPlanSchema, await readJson(request));
  await assertMonthUnlocked(user.id, body.month);

  return await db.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, body.categoryId), eq(categories.userId, user.id)))
      .limit(1);
    if (!category) {
      throw new NotFoundError("Category not found.");
    }

    const [existing] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.userId, user.id), eq(plans.categoryId, body.categoryId), eq(plans.month, body.month)))
      .limit(1);

    const planId = existing?.id ?? newId();
    if (existing) {
      await tx
        .update(plans)
        .set({ amountMinorUnits: body.amountMinorUnits, updatedAt: new Date() })
        .where(eq(plans.id, planId));
    } else {
      await tx.insert(plans).values({
        id: planId,
        userId: user.id,
        categoryId: body.categoryId,
        month: body.month,
        amountMinorUnits: body.amountMinorUnits,
      });
    };

    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "plan",
      entityId: planId,
      action: existing ? "plan.updated" : "plan.created",
      detail: { categoryId: body.categoryId, month: body.month, amountMinorUnits: body.amountMinorUnits },
    });

    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId));
    return ok({ plan });
  });
});
