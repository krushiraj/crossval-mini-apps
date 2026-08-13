import { and, eq, inArray } from "drizzle-orm";

import { db, type DatabaseOrTransaction } from "@/lib/db";
import { formatMonth } from "@/lib/dates";
import { actuals, periodLocks, plans } from "@/lib/db/schema";
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

// A delete takes the category's plans and actuals with it, which would rewrite
// a closed month's report without ever unlocking it.
export const assertCategoryNotInLockedPeriod = async (
  userId: string,
  categoryId: string,
  tx: DatabaseOrTransaction = db,
): Promise<void> => {
  const locks = await tx
    .select({ month: periodLocks.month })
    .from(periodLocks)
    .where(eq(periodLocks.userId, userId));
  if (locks.length === 0) return;

  const lockedMonths = locks.map((lock) => lock.month);
  const plannedIn = await tx
    .select({ month: plans.month })
    .from(plans)
    .where(and(eq(plans.categoryId, categoryId), inArray(plans.month, lockedMonths)));
  const actualIn = await tx
    .select({ month: actuals.month })
    .from(actuals)
    .where(and(eq(actuals.categoryId, categoryId), inArray(actuals.month, lockedMonths)));

  const months = [...new Set([...plannedIn, ...actualIn].map((row) => row.month))].sort();
  if (months.length === 0) return;

  const listed = months.map(formatMonth).join(", ");
  throw new ConflictError(
    "CATEGORY_IN_LOCKED_PERIOD",
    months.length === 1
      ? `This category has figures in ${listed}, which is locked. Unlock it before deleting the category.`
      : `This category has figures in locked months (${listed}). Unlock them before deleting the category.`,
    { months },
  );
};
