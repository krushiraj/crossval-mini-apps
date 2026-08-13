// Shape only. Rules needing stored state, like whether a payment overpays,
// live in lib/calc/orders.ts.

import { z } from "zod";

import { MAX_MINOR_UNITS, MAX_QUANTITY } from "@/lib/money";

import { isIsoDate } from "@/lib/dates";

const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: "Must be a valid date in YYYY-MM-DD format." });

export const orderLineItemSchema = z.object({
  description: z.string().trim().min(1, "Line item description is required.").max(200, "Line item description must be 200 characters or fewer."),
  quantity: z.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.")
    .max(MAX_QUANTITY, "Quantity is too large."),
  unitPriceMinorUnits: z
    .number()
    .int("Unit price must be an integer number of minor units.")
    .min(0, "Unit price cannot be negative.")
    .max(MAX_MINOR_UNITS, "Unit price is too large."),
});

export const createOrderSchema = z.object({
  customer: z.string().trim().min(1, "Customer name is required.").max(200, "Customer name must be 200 characters or fewer."),
  dueDate: isoDateSchema,
  lines: z.array(orderLineItemSchema).min(1, "An order needs at least one line item."),
});

// Customer/due date edits are always allowed; lines are replaced separately via PUT .../lines.
export const updateOrderSchema = z.object({
  customer: z.string().trim().min(1, "Customer name is required.").max(200, "Customer name must be 200 characters or fewer.").optional(),
  dueDate: isoDateSchema.optional(),
});

export const replaceOrderLinesSchema = z.object({
  lines: z.array(orderLineItemSchema).min(1, "An order needs at least one line item."),
});

export const recordPaymentSchema = z.object({
  amountMinorUnits: z
    .number()
    .int("Payment amount must be an integer number of minor units.")
    .min(1, "Payment amount must be at least $0.01.")
    .max(MAX_MINOR_UNITS, "Payment amount is too large."),
  paidDate: isoDateSchema,
  note: z.string().trim().max(500).optional(),
});

export const orderStatusFilterSchema = z.enum(["pending", "partially_paid", "paid", "overdue"]);
