import { and, eq } from "drizzle-orm";

import { apiRoute, noContent, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { actuals, categories } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/errors";
import { updateActualSchema } from "@/lib/validation/planner";
import { assertMonthUnlocked } from "@/app/api/planner/_lib";

const loadOwnedActual = async (userId: string, id: string) => {
  const [actual] = await db
    .select()
    .from(actuals)
    .where(and(eq(actuals.id, id), eq(actuals.userId, userId)))
    .limit(1);
  if (!actual) {
    throw new NotFoundError("Actual entry not found.");
  }
  return actual;
};

// Both the current and target month must be unlocked, or someone could dodge
// a lock by moving spend into it after the fact.
export const PATCH = apiRoute(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = validate(updateActualSchema, await readJson(request));

  const existing = await loadOwnedActual(user.id, id);
  await assertMonthUnlocked(user.id, existing.month);
  if (body.month && body.month !== existing.month) {
    await assertMonthUnlocked(user.id, body.month);
  }

  return await db.transaction(async (tx) => {
    if (body.categoryId) {
      const [category] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, body.categoryId), eq(categories.userId, user.id)))
        .limit(1);
      if (!category) {
        throw new NotFoundError("Category not found.");
      }
    }

    await tx
      .update(actuals)
      .set({
        ...(body.categoryId ? { categoryId: body.categoryId } : {}),
        ...(body.month ? { month: body.month } : {}),
        ...(body.amountMinorUnits !== undefined ? { amountMinorUnits: body.amountMinorUnits } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        updatedAt: new Date(),
      })
      .where(eq(actuals.id, id));

    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "actual",
      entityId: id,
      action: "actual.updated",
      detail: { before: existing, changes: body },
    });

    const [actual] = await tx.select().from(actuals).where(eq(actuals.id, id));
    return ok({ actual });
  });
});

export const DELETE = apiRoute(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;

  const existing = await loadOwnedActual(user.id, id);
  await assertMonthUnlocked(user.id, existing.month);

  return await db.transaction(async (tx) => {
    await tx.delete(actuals).where(eq(actuals.id, id));
    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "actual",
      entityId: id,
      action: "actual.deleted",
      detail: { categoryId: existing.categoryId, month: existing.month, amountMinorUnits: existing.amountMinorUnits },
    });
    return noContent();
  });
});
