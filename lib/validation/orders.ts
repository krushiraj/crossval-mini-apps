// Request-body schemas for the Orders and Settlements API. Zod handles shape
// and type validation (is this an integer, is this a valid ISO date); the
// business rules that depend on stored state (does this order have payments,
// would this payment overpay it) live in lib/calc/orders.ts and are checked
// after the row is loaded, not here.

import { z } from "zod";

import { isIsoDate } from "@/lib/dates";

const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: "Must be a valid date in YYYY-MM-DD format." });

export const orderLineItemSchema = z.object({
  description: z.string().trim().min(1, "Line item description is required.").max(200),
  quantity: z.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1."),
  unitPriceMinorUnits: z
    .number()
    .int("Unit price must be an integer number of minor units.")
    .min(0, "Unit price cannot be negative."),
});

export const createOrderSchema = z.object({
  customer: z.string().trim().min(1, "Customer name is required.").max(200),
  dueDate: isoDateSchema,
  lines: z.array(orderLineItemSchema).min(1, "An order needs at least one line item."),
});

// Customer/due date edits are always allowed; lines are replaced separately via PUT .../lines.
export const updateOrderSchema = z.object({
  customer: z.string().trim().min(1, "Customer name is required.").max(200).optional(),
  dueDate: isoDateSchema.optional(),
});

export const replaceOrderLinesSchema = z.object({
  lines: z.array(orderLineItemSchema).min(1, "An order needs at least one line item."),
});

export const recordPaymentSchema = z.object({
  amountMinorUnits: z
    .number()
    .int("Payment amount must be an integer number of minor units.")
    .min(1, "Payment amount must be at least $0.01."),
  paidDate: isoDateSchema,
  note: z.string().trim().max(500).optional(),
});

export const orderStatusFilterSchema = z.enum(["pending", "partially_paid", "paid", "overdue"]);
