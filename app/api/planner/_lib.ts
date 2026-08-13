import { and, eq } from "drizzle-orm";

import { db, type DatabaseOrTransaction } from "@/lib/db";
import { formatMonth } from "@/lib/dates";
import { periodLocks } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";

export const assertMonthUnlocked = async (
  userId: string,
  month: string,
  tx: DatabaseOrTransaction = db,
): Promise<void> => {
  const [lock] = await tx
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(and(eq(periodLocks.userId, userId), eq(periodLocks.month, month)))
    .limit(1);

  if (lock) {
    throw new ConflictError(
      "PERIOD_LOCKED",
      `${formatMonth(month)} is locked. Unlock the period before editing its plans or actuals.`,
      { month },
    );
  }
};
