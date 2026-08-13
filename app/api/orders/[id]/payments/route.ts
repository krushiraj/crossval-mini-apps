import { and, eq } from "drizzle-orm";

import { loadOrderPayments, loadOwnedOrder, serializePayment, summarizeOrder } from "@/app/api/orders/_lib";
import { assertPaymentAllowed } from "@/lib/calc/orders";
import {
  apiRoute,
  created,
  idempotencyKeyFrom,
  newId,
  readJson,
  recordAudit,
  requireUser,
  validate,
} from "@/lib/api-utils";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";
import { recordPaymentSchema } from "@/lib/validation/orders";

type RouteContext = { params: Promise<{ id: string }> };

// libSQL gives no typed error for this, only a message.
const isUniqueConstraintError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
};

// The balance check must run inside the insert's transaction, or two payments
// at once could both look affordable.
export const POST = apiRoute(async (request, { params }: RouteContext) => {
  const user = await requireUser();
  const { id } = await params;
  const body = validate(recordPaymentSchema, await readJson(request));
  const idempotencyKey = idempotencyKeyFrom(request);

  const order = await loadOwnedOrder(db, user.id, id);

  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.userId, user.id), eq(payments.idempotencyKey, idempotencyKey)));
    if (existing) {
      if (existing.orderId !== id) {
        throw new ConflictError(
          "IDEMPOTENCY_KEY_REUSED",
          "This Idempotency-Key was already used for a different order's payment.",
        );
      }
      const paymentRows = await loadOrderPayments(db, id);
      return created({
        payment: serializePayment(existing),
        summary: summarizeOrder(order, paymentRows),
      });
    }
  }

  try {
    const { inserted, allPayments } = await db.transaction(async (tx) => {
      const existingPayments = await tx.select().from(payments).where(eq(payments.orderId, id));
      const alreadyPaidMinorUnits = existingPayments.reduce(
        (sum, payment) => sum + payment.amountMinorUnits,
        0,
      );

      assertPaymentAllowed({
        totalMinorUnits: order.totalMinorUnits,
        alreadyPaidMinorUnits,
        amountMinorUnits: body.amountMinorUnits,
      });

      const paymentId = newId();
      await tx.insert(payments).values({
        id: paymentId,
        orderId: id,
        userId: user.id,
        amountMinorUnits: body.amountMinorUnits,
        paidDate: body.paidDate,
        note: body.note ?? null,
        idempotencyKey,
      });

      await recordAudit(tx, {
        userId: user.id,
        app: "orders",
        entityType: "order",
        entityId: id,
        action: "payment.recorded",
        detail: { paymentId, amountMinorUnits: body.amountMinorUnits, paidDate: body.paidDate },
      });

      const [insertedRow] = await tx.select().from(payments).where(eq(payments.id, paymentId));
      return { inserted: insertedRow, allPayments: [...existingPayments, insertedRow] };
    });

    return created({
      payment: serializePayment(inserted),
      summary: summarizeOrder(order, allPayments),
    });
  } catch (error) {
    // Same key racing itself: the unique index rejects the loser, whose caller
    // should get the winner's payment rather than a 500.
    if (idempotencyKey && isUniqueConstraintError(error)) {
      const [existing] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.userId, user.id), eq(payments.idempotencyKey, idempotencyKey)));
      if (existing) {
        const paymentRows = await loadOrderPayments(db, id);
        return created({
          payment: serializePayment(existing),
          summary: summarizeOrder(order, paymentRows),
        });
      }
    }

    if (error instanceof ConflictError) {
      await db.transaction(async (tx) => {
        await recordAudit(tx, {
          userId: user.id,
          app: "orders",
          entityType: "order",
          entityId: id,
          action: "payment.rejected",
          detail: {
            attemptedAmountMinorUnits: body.amountMinorUnits,
            code: error.code,
            message: error.message,
          },
        });
      });
    }
    throw error;
  }
});
