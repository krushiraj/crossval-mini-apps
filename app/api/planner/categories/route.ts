import { asc, eq } from "drizzle-orm";

import { apiRoute, created, newId, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";
import { createCategorySchema } from "@/lib/validation/planner";

export const GET = apiRoute(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, user.id))
    .orderBy(asc(categories.name));
  return ok({ categories: rows });
});

// Uniqueness is case-insensitive, checked in JS rather than a SQL LOWER()
// index; the DB's case-sensitive index guards only against a race.
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  const body = validate(createCategorySchema, await readJson(request));

  return await db.transaction(async (tx) => {
    const existing = await tx.select({ name: categories.name }).from(categories).where(eq(categories.userId, user.id));
    if (existing.some((row) => row.name.toLowerCase() === body.name.toLowerCase())) {
      throw new ConflictError("DUPLICATE_CATEGORY_NAME", `A category named "${body.name}" already exists.`, {
        field: "name",
      });
    }

    const id = newId();
    await tx.insert(categories).values({ id, userId: user.id, name: body.name });
    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "category",
      entityId: id,
      action: "category.created",
      detail: { name: body.name },
    });

    const [category] = await tx.select().from(categories).where(eq(categories.id, id));
    return created({ category });
  });
});
