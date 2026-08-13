import { eq } from "drizzle-orm";

import { serializeOrderListItem } from "@/app/api/orders/_lib";
import { computeOrderTotal } from "@/lib/calc/orders";
import { apiRoute, created, newId, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { todayIsoDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { orderLineItems, orders, payments } from "@/lib/db/schema";
import { createOrderSchema, orderStatusFilterSchema } from "@/lib/validation/orders";
import { ValidationError } from "@/lib/errors";

export const GET = apiRoute(async (request) => {
  const user = await requireUser();

  const statusParam = new URL(request.url).searchParams.get("status");
  let statusFilter: string | null = null;
  if (statusParam) {
    const parsed = orderStatusFilterSchema.safeParse(statusParam);
    if (!parsed.success) {
      throw new ValidationError(
        "INVALID_STATUS_FILTER",
        `status must be one of: ${orderStatusFilterSchema.options.join(", ")}.`,
      );
    };
    statusFilter = parsed.data;
  };

  const [orderRows, paymentRows] = await Promise.all([
    db.select().from(orders).where(eq(orders.userId, user.id)),
    db.select().from(payments).where(eq(payments.userId, user.id)),
  ]);

  const paymentsByOrder = new Map<string, typeof paymentRows>();
  for (const payment of paymentRows) {
    const bucket = paymentsByOrder.get(payment.orderId);
    if (bucket) {
      bucket.push(payment);
    } else {
      paymentsByOrder.set(payment.orderId, [payment]);
    };
  };

  const today = todayIsoDate();
  const items = orderRows
    .map((order) => serializeOrderListItem(order, paymentsByOrder.get(order.id) ?? [], today))
    // Filtering happens after derivation — an order's stored fields never
    // carry a status, only the payments and due date it's derived from.
    .filter((item) => !statusFilter || item.status === statusFilter)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return ok({ orders: items });
});

export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  const body = validate(createOrderSchema, await readJson(request));

  // Computes the total the same way every other reader of an order's amount
  // does, via the shared calc module.
  const totals = computeOrderTotal(body.lines);

  const orderId = newId();

  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: orderId,
      userId: user.id,
      customer: body.customer,
      dueDate: body.dueDate,
      totalMinorUnits: totals.totalMinorUnits,
    });

    await tx.insert(orderLineItems).values(
      body.lines.map((line, index) => ({
        id: newId(),
        orderId,
        position: index,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinorUnits: line.unitPriceMinorUnits,
        lineTotalMinorUnits: totals.lines[index].lineTotalMinorUnits,
      })),
    );

    await recordAudit(tx, {
      userId: user.id,
      app: "orders",
      entityType: "order",
      entityId: orderId,
      action: "order.created",
      detail: { customer: body.customer, dueDate: body.dueDate, totalMinorUnits: totals.totalMinorUnits },
    });
  });

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  return created(serializeOrderListItem(order, []));
});
