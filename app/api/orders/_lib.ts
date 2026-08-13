import { and, desc, eq } from "drizzle-orm";

import { computeOrderSummary } from "@/lib/calc/orders";
import type { OrderStatus } from "@/lib/calc/orders";
import { todayIsoDate } from "@/lib/dates";
import type { DatabaseOrTransaction } from "@/lib/db";
import { auditLog, orderLineItems, orders, payments } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/errors";

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineItemRow = typeof orderLineItems.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;

// A missing order and one owned by someone else both 404, so we never
// reveal another user's order exists.
export const loadOwnedOrder = async (
  handle: DatabaseOrTransaction,
  userId: string,
  orderId: string,
): Promise<OrderRow> => {
  const [order] = await handle
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  if (!order) {
    throw new NotFoundError("Order not found.");
  }
  return order;
};

export const loadOrderLines = async (
  handle: DatabaseOrTransaction,
  orderId: string,
): Promise<OrderLineItemRow[]> => {
  return handle
    .select()
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, orderId))
    .orderBy(orderLineItems.position);
};

export const loadOrderPayments = async (
  handle: DatabaseOrTransaction,
  orderId: string,
): Promise<PaymentRow[]> => {
  return handle
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.paidDate), desc(payments.createdAt));
};

export const loadOrderAuditHistory = async (
  handle: DatabaseOrTransaction,
  userId: string,
  orderId: string,
): Promise<AuditLogRow[]> => {
  return handle
    .select()
    .from(auditLog)
    .where(
      and(eq(auditLog.userId, userId), eq(auditLog.entityType, "order"), eq(auditLog.entityId, orderId)),
    )
    .orderBy(desc(auditLog.createdAt));
};

export const serializeLineItem = (line: OrderLineItemRow) => {
  return {
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinorUnits: line.unitPriceMinorUnits,
    lineTotalMinorUnits: line.lineTotalMinorUnits,
  };
};

export const serializePayment = (payment: PaymentRow) => {
  return {
    id: payment.id,
    amountMinorUnits: payment.amountMinorUnits,
    paidDate: payment.paidDate,
    note: payment.note,
    createdAt: payment.createdAt,
  };
};

export const serializeAuditEntry = (entry: AuditLogRow) => {
  return {
    id: entry.id,
    action: entry.action,
    detail: entry.detail ? (JSON.parse(entry.detail) as Record<string, unknown>) : null,
    createdAt: entry.createdAt,
  };
};

export interface OrderSummaryDto {
  paidMinorUnits: number;
  dueMinorUnits: number;
  status: OrderStatus;
}

// Derives paid/due/status from a payment ledger — never from a stored balance.
export const summarizeOrder = (
  order: OrderRow,
  paymentRows: PaymentRow[],
  today: string = todayIsoDate(),
): OrderSummaryDto => {
  return computeOrderSummary({
    totalMinorUnits: order.totalMinorUnits,
    payments: paymentRows.map((payment) => ({ amountMinorUnits: payment.amountMinorUnits })),
    dueDate: order.dueDate,
    today,
  });
};

export const serializeOrderListItem = (
  order: OrderRow,
  paymentRows: PaymentRow[],
  today: string = todayIsoDate(),
) => {
  const summary = summarizeOrder(order, paymentRows, today);
  return {
    id: order.id,
    customer: order.customer,
    dueDate: order.dueDate,
    totalMinorUnits: order.totalMinorUnits,
    ...summary,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

export const serializeOrderDetail = (
  order: OrderRow,
  lineRows: OrderLineItemRow[],
  paymentRows: PaymentRow[],
  auditRows: AuditLogRow[],
  today: string = todayIsoDate(),
) => {
  return {
    ...serializeOrderListItem(order, paymentRows, today),
    lines: lineRows.map(serializeLineItem),
    payments: paymentRows.map(serializePayment),
    auditHistory: auditRows.map(serializeAuditEntry),
  };
};
