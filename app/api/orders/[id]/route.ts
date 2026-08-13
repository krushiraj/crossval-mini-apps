import { eq } from "drizzle-orm";

import {
  loadOrderAuditHistory,
  loadOrderLines,
  loadOrderPayments,
  loadOwnedOrder,
  serializeOrderDetail,
} from "@/app/api/orders/_lib";
import { apiRoute, noContent, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";
import { updateOrderSchema } from "@/lib/validation/orders";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = apiRoute(async (_request, { params }: RouteContext) => {
  const user = await requireUser();
  const { id } = await params;

  const order = await loadOwnedOrder(db, user.id, id);
  const [lines, paymentRows, auditRows] = await Promise.all([
    loadOrderLines(db, id),
    loadOrderPayments(db, id),
    loadOrderAuditHistory(db, user.id, id),
  ]);

  return ok(serializeOrderDetail(order, lines, paymentRows, auditRows));
});

// Customer and due date stay editable regardless of payment history — they
// describe who owes the money and when it's expected, not the settled
// amount, so changing them after a payment is recorded carries no
// bookkeeping risk. Lines and the total are the separate, payment-gated
// endpoint (PUT .../lines).
export const PATCH = apiRoute(async (request, { params }: RouteContext) => {
  const user = await requireUser();
  const { id } = await params;
  const body = validate(updateOrderSchema, await readJson(request));

  await loadOwnedOrder(db, user.id, id);

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        ...(body.customer !== undefined ? { customer: body.customer } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));

    await recordAudit(tx, {
      userId: user.id,
      app: "orders",
      entityType: "order",
      entityId: id,
      action: "order.updated",
      detail: body,
    });
  });

  const updated = await loadOwnedOrder(db, user.id, id);
  const [lines, paymentRows, auditRows] = await Promise.all([
    loadOrderLines(db, id),
    loadOrderPayments(db, id),
    loadOrderAuditHistory(db, user.id, id),
  ]);

  return ok(serializeOrderDetail(updated, lines, paymentRows, auditRows));
});

export const DELETE = apiRoute(async (_request, { params }: RouteContext) => {
  const user = await requireUser();
  const { id } = await params;

  await loadOwnedOrder(db, user.id, id);
  const existingPayments = await loadOrderPayments(db, id);
  if (existingPayments.length > 0) {
    throw new ConflictError(
      "ORDER_HAS_PAYMENTS",
      "This order already has payments recorded and can no longer be deleted.",
    );
  };

  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      userId: user.id,
      app: "orders",
      entityType: "order",
      entityId: id,
      action: "order.deleted",
    });
    await tx.delete(orders).where(eq(orders.id, id));
  });

  return noContent();
});
