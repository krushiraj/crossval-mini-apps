import { eq } from "drizzle-orm";

import {
  loadOrderAuditHistory,
  loadOrderLines,
  loadOrderPayments,
  loadOwnedOrder,
  serializeOrderDetail,
} from "@/app/api/orders/_lib";
import { computeOrderTotal } from "@/lib/calc/orders";
import { apiRoute, newId, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { orderLineItems, orders } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";
import { replaceOrderLinesSchema } from "@/lib/validation/orders";

type RouteContext = { params: Promise<{ id: string }> };

// Once a payment exists, lines/total are locked: a payment asserts against a
// specific total, and moving that total would silently break the assertion.
export const PUT = apiRoute(async (request, { params }: RouteContext) => {
  const user = await requireUser();
  const { id } = await params;
  const body = validate(replaceOrderLinesSchema, await readJson(request));

  await loadOwnedOrder(db, user.id, id);

  const existingPayments = await loadOrderPayments(db, id);
  if (existingPayments.length > 0) {
    throw new ConflictError(
      "ORDER_HAS_PAYMENTS",
      "This order already has payments recorded and can no longer be edited. Record a further payment or a refund instead.",
    );
  }

  const totals = computeOrderTotal(body.lines);

  await db.transaction(async (tx) => {
    await tx.delete(orderLineItems).where(eq(orderLineItems.orderId, id));

    await tx.insert(orderLineItems).values(
      body.lines.map((line, index) => ({
        id: newId(),
        orderId: id,
        position: index,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinorUnits: line.unitPriceMinorUnits,
        lineTotalMinorUnits: totals.lines[index].lineTotalMinorUnits,
      })),
    );

    await tx
      .update(orders)
      .set({ totalMinorUnits: totals.totalMinorUnits, updatedAt: new Date() })
      .where(eq(orders.id, id));

    await recordAudit(tx, {
      userId: user.id,
      app: "orders",
      entityType: "order",
      entityId: id,
      action: "order.lines_replaced",
      detail: { totalMinorUnits: totals.totalMinorUnits, lineCount: body.lines.length },
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
