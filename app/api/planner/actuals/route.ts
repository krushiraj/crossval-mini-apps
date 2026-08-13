import { and, eq, gte, lte } from "drizzle-orm";

import { apiRoute, created, newId, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { actuals, categories } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/errors";
import { actualsQuerySchema, createActualSchema } from "@/lib/validation/planner";
import { assertMonthUnlocked } from "@/app/api/planner/_lib";

export const GET = apiRoute(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = validate(actualsQuerySchema, Object.fromEntries(url.searchParams));

  const conditions = [eq(actuals.userId, user.id), gte(actuals.month, query.from), lte(actuals.month, query.to)];
  if (query.categoryId) {
    conditions.push(eq(actuals.categoryId, query.categoryId));
  }

  const rows = await db
    .select()
    .from(actuals)
    .where(and(...conditions));

  return ok({ actuals: rows });
});

export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  const body = validate(createActualSchema, await readJson(request));
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

    const id = newId();
    await tx.insert(actuals).values({
      id,
      userId: user.id,
      categoryId: body.categoryId,
      month: body.month,
      amountMinorUnits: body.amountMinorUnits,
      note: body.note ?? null,
    });

    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "actual",
      entityId: id,
      action: "actual.created",
      detail: { categoryId: body.categoryId, month: body.month, amountMinorUnits: body.amountMinorUnits },
    });

    const [actual] = await tx.select().from(actuals).where(eq(actuals.id, id));
    return created({ actual });
  });
});
