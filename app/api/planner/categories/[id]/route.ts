import { and, eq } from "drizzle-orm";

import { assertCategoryNotInLockedPeriod } from "@/app/api/planner/_lib";
import { apiRoute, noContent, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { updateCategorySchema } from "@/lib/validation/planner";

const loadOwnedCategory = async (userId: string, id: string) => {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);
  if (!category) {
    throw new NotFoundError("Category not found.");
  }
  return category;
};

export const PATCH = apiRoute(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = validate(updateCategorySchema, await readJson(request));
  await loadOwnedCategory(user.id, id);

  return await db.transaction(async (tx) => {
    const existing = await tx.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, user.id));
    const collision = existing.find((row) => row.id !== id && row.name.toLowerCase() === body.name.toLowerCase());
    if (collision) {
      throw new ConflictError("DUPLICATE_CATEGORY_NAME", `A category named "${body.name}" already exists.`, {
        field: "name",
      });
    }

    await tx.update(categories).set({ name: body.name }).where(eq(categories.id, id));
    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "category",
      entityId: id,
      action: "category.updated",
      detail: { name: body.name },
    });

    const [category] = await tx.select().from(categories).where(eq(categories.id, id));
    return ok({ category });
  });
});

export const DELETE = apiRoute(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await loadOwnedCategory(user.id, id);

  return await db.transaction(async (tx) => {
    // Inside the transaction, or a month locked at the same moment slips past.
    await assertCategoryNotInLockedPeriod(user.id, id, tx);

    await tx.delete(categories).where(eq(categories.id, id));
    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "category",
      entityId: id,
      action: "category.deleted",
    });
    return noContent();
  });
});
