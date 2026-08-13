// Zod schemas for the Multi-Rate Pricing Calculator API.
//
// These mirror the shape `lib/calc/pricing.ts` expects (`LineItemInput`) but
// stay purely structural — range checks that depend on *other* fields (a
// fixed discount exceeding the line subtotal, a percent discount above 100%)
// are the calculation module's job, since it is the single source of truth
// for those rules and already reports them with a specific error code.

import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { MAX_MINOR_UNITS, MAX_QUANTITY } from "@/lib/money";

const isoDate = z
  .string()
  .refine((value) => isIsoDate(value), { message: "Must be a valid date in YYYY-MM-DD format." });

// Fields with no `.default()` applied. Used directly by `updateLineSchema`:
// `.partial()` only makes an empty `{}` correctly *stay* empty when there is
// no default waiting to fill each key back in during parsing — a schema with
// defaults would make every patch look non-empty after parsing, even `{}`.
const lineItemFields = {
  description: z.string().trim().min(1, "Description is required.").max(500),
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(MAX_QUANTITY, "Quantity is too large."),
  unitPriceMinorUnits: z
    .number()
    .int("Unit price must be a whole number of minor units.")
    .min(0, "Unit price cannot be negative.")
    .max(MAX_MINOR_UNITS, "Unit price is too large."),
  discountType: z.enum(["percent", "fixed"]).nullable(),
  discountValue: z.number().int("Discount must be a whole number.").min(0, "Discount cannot be negative."),
  taxRateBasisPoints: z
    .number()
    .int("Tax percent must be a whole number of basis points.")
    .min(0, "Tax percent cannot be negative."),
};

const lineItemBase = z.object(lineItemFields);

export const lineItemSchema = lineItemBase.extend({
  discountType: lineItemFields.discountType.default(null),
  discountValue: lineItemFields.discountValue.default(0),
  taxRateBasisPoints: lineItemFields.taxRateBasisPoints.default(0),
});

export type LineItemPayload = z.infer<typeof lineItemSchema>;

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  customer: z.string().trim().min(1, "Customer is required.").max(200),
  issueDate: isoDate,
  lines: z.array(lineItemSchema).default([]),
});

export type CreateDocumentPayload = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200).optional(),
    customer: z.string().trim().min(1, "Customer is required.").max(200).optional(),
    issueDate: isoDate.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (title, customer, issueDate) must be provided.",
  });

export type UpdateDocumentPayload = z.infer<typeof updateDocumentSchema>;

export const replaceLinesSchema = z.object({
  lines: z.array(lineItemSchema),
});

export type ReplaceLinesPayload = z.infer<typeof replaceLinesSchema>;

export const createLineSchema = lineItemSchema;

export const updateLineSchema = lineItemBase.partial().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided.",
});

export type UpdateLinePayload = z.infer<typeof updateLineSchema>;

export const documentsQuerySchema = z.object({
  status: z.enum(["draft", "finalized"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const reportQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((data) => data.from <= data.to, {
    message: "`from` must be on or before `to`.",
    path: ["from"],
  });
