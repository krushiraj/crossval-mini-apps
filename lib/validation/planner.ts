// Shape only. Rules needing stored state, like whether a month is locked,
// are checked in the routes.

import { z } from "zod";

import { MAX_MINOR_UNITS } from "@/lib/money";

import { isIsoMonth } from "@/lib/dates";

const isoMonthSchema = z
  .string()
  .refine(isIsoMonth, { message: "Must be a valid month in YYYY-MM format." });

const moneyAmountSchema = z
  .number()
  .int("Amount must be an integer number of minor units.")
  .min(0, "Amount cannot be negative.")
  .max(MAX_MINOR_UNITS, "Amount is too large.");

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(100),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(100),
});

export const upsertPlanSchema = z.object({
  categoryId: z.string().trim().min(1, "categoryId is required."),
  month: isoMonthSchema,
  amountMinorUnits: moneyAmountSchema,
});

export const plansQuerySchema = z
  .object({
    from: isoMonthSchema,
    to: isoMonthSchema,
  })
  .refine((data) => data.from <= data.to, {
    message: "`from` must be on or before `to`.",
    path: ["from"],
  });

export const createActualSchema = z.object({
  categoryId: z.string().trim().min(1, "categoryId is required."),
  month: isoMonthSchema,
  amountMinorUnits: moneyAmountSchema,
  note: z.string().trim().max(500).optional(),
});

export const updateActualSchema = z
  .object({
    categoryId: z.string().trim().min(1).optional(),
    month: isoMonthSchema.optional(),
    amountMinorUnits: moneyAmountSchema.optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export const actualsQuerySchema = z
  .object({
    from: isoMonthSchema,
    to: isoMonthSchema,
    categoryId: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.from <= data.to, {
    message: "`from` must be on or before `to`.",
    path: ["from"],
  });

export const importActualsSchema = z.object({
  csv: z.string().min(1, "CSV content is required."),
});

export const lockMonthSchema = z.object({
  month: isoMonthSchema,
});

export const reportQuerySchema = z
  .object({
    from: isoMonthSchema,
    to: isoMonthSchema,
  })
  .refine((data) => data.from <= data.to, {
    message: "`from` must be on or before `to`.",
    path: ["from"],
  });
