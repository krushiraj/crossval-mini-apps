import { and, eq } from "drizzle-orm";

import { apiRoute, noContent, requireUser, recordAudit } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { periodLocks } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { isIsoMonth } from "@/lib/dates";

export const DELETE = apiRoute(async (_request, { params }: { params: Promise<{ month: string }> }) => {
  const user = await requireUser();
  const { month } = await params;

  if (!isIsoMonth(month)) {
    throw new ValidationError("INVALID_MONTH", "Must be a valid month in YYYY-MM format.");
  }

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(periodLocks)
      .where(and(eq(periodLocks.userId, user.id), eq(periodLocks.month, month)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError(`${month} is not locked.`);
    }

    await tx.delete(periodLocks).where(eq(periodLocks.id, existing.id));
    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "periodLock",
      entityId: existing.id,
      action: "period.unlocked",
      detail: { month },
    });

    return noContent();
  });
});
