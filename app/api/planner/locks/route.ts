import { and, eq } from "drizzle-orm";

import { apiRoute, created, newId, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { periodLocks } from "@/lib/db/schema";
import { lockMonthSchema } from "@/lib/validation/planner";

export const GET = apiRoute(async () => {
  const user = await requireUser();
  const rows = await db.select().from(periodLocks).where(eq(periodLocks.userId, user.id));
  return ok({ locks: rows });
});

// Locking an already-locked month is idempotent: it returns the existing
// lock rather than erroring, since two "close January" clicks in a row
// isn't a conflict worth surfacing.
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  const body = validate(lockMonthSchema, await readJson(request));

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(periodLocks)
      .where(and(eq(periodLocks.userId, user.id), eq(periodLocks.month, body.month)))
      .limit(1);
    if (existing) {
      return ok({ lock: existing });
    }

    const id = newId();
    await tx.insert(periodLocks).values({ id, userId: user.id, month: body.month });
    await recordAudit(tx, {
      userId: user.id,
      app: "planner",
      entityType: "periodLock",
      entityId: id,
      action: "period.locked",
      detail: { month: body.month },
    });

    const [lock] = await tx.select().from(periodLocks).where(eq(periodLocks.id, id));
    return created({ lock });
  });
});
