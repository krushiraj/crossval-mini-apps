// Multi-Rate Pricing Calculator — the single source of truth for document math.
//
// Order of operations per line, as required by the spec:
//   1. subtotal  = quantity x unit price                  (exact integer)
//   2. discount  = percent of subtotal, or a fixed amount  (rounded half-up)
//   3. tax       = tax percent of the DISCOUNTED amount   (rounded half-up)
//   4. total     = discounted amount + tax
//
// Document totals are sums of already-rounded line amounts, so they are exact
// and always reconcile: grand total === subtotal - discount + tax.

import { ValidationError } from "@/lib/errors";
import { BASIS_POINTS_PER_UNIT, Money } from "@/lib/money";

export type DiscountType = "percent" | "fixed";

export interface LineItemInput {
  description?: string;
  // Whole units, at least 1.
  quantity: number;
  // Price per unit in minor units, at least 0.
  unitPriceMinorUnits: number;
  // `null` when the line has no discount.
  discountType: DiscountType | null;
  // Basis points when `discountType` is "percent", minor units when "fixed", 0 when null.
  discountValue: number;
  // Tax rate in basis points applied to the discounted amount. 0 for untaxed lines.
  taxRateBasisPoints: number;
}

export interface LineTotals {
  subtotalMinorUnits: number;
  discountMinorUnits: number;
  discountedMinorUnits: number;
  taxMinorUnits: number;
  totalMinorUnits: number;
}

export interface DocumentTotals {
  subtotalMinorUnits: number;
  totalDiscountMinorUnits: number;
  totalTaxMinorUnits: number;
  grandTotalMinorUnits: number;
}

export interface DocumentComputation extends DocumentTotals {
  lines: LineTotals[];
}

const assertLineIsValid = (line: LineItemInput, index: number): void => {
  const at = (field: string) => ({ field, lineIndex: index });

  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new ValidationError(
      "INVALID_QUANTITY",
      `Line ${index + 1}: quantity must be a whole number of at least 1.`,
      at("quantity"),
    );
  }

  if (!Number.isInteger(line.unitPriceMinorUnits) || line.unitPriceMinorUnits < 0) {
    throw new ValidationError(
      "INVALID_UNIT_PRICE",
      `Line ${index + 1}: unit price cannot be negative.`,
      at("unitPrice"),
    );
  }

  if (!Number.isInteger(line.taxRateBasisPoints) || line.taxRateBasisPoints < 0) {
    throw new ValidationError(
      "INVALID_TAX_PERCENT",
      `Line ${index + 1}: tax percent cannot be negative.`,
      at("taxPercent"),
    );
  }

  if (line.taxRateBasisPoints > BASIS_POINTS_PER_UNIT) {
    throw new ValidationError(
      "INVALID_TAX_PERCENT",
      `Line ${index + 1}: tax percent must be between 0 and 100.`,
      at("taxPercent"),
    );
  }

  if (line.discountType === null) {
    if (line.discountValue !== 0) {
      throw new ValidationError(
        "INVALID_DISCOUNT",
        `Line ${index + 1}: a discount value was supplied without a discount type.`,
        at("discountType"),
      );
    }
    return;
  }

  if (!Number.isInteger(line.discountValue) || line.discountValue < 0) {
    throw new ValidationError(
      "INVALID_DISCOUNT",
      `Line ${index + 1}: discount cannot be negative.`,
      at("discountValue"),
    );
  }

  if (line.discountType === "percent" && line.discountValue > BASIS_POINTS_PER_UNIT) {
    throw new ValidationError(
      "INVALID_DISCOUNT_PERCENT",
      `Line ${index + 1}: discount percent must be between 0 and 100.`,
      at("discountValue"),
    );
  }
};

// Computes one line. A line carries either a percent discount or a fixed
// discount, never both — the data model makes that unrepresentable by storing
// a single `discountType` alongside a single `discountValue`.
//
// A fixed discount larger than the line subtotal is rejected rather than
// clamped, so a mistyped discount surfaces as an error instead of silently
// becoming "this line is free".
export const computeLine = (line: LineItemInput, index = 0): LineTotals => {
  assertLineIsValid(line, index);

  const subtotal = Money.fromMinorUnits(line.unitPriceMinorUnits).timesQuantity(line.quantity);

  let discount = Money.zero();
  if (line.discountType === "percent") {
    discount = subtotal.applyRate(line.discountValue);
  } else if (line.discountType === "fixed") {
    discount = Money.fromMinorUnits(line.discountValue);
    if (discount.greaterThan(subtotal)) {
      throw new ValidationError(
        "DISCOUNT_EXCEEDS_SUBTOTAL",
        `Line ${index + 1}: fixed discount of ${discount.format()} exceeds the line subtotal of ${subtotal.format()}.`,
        { field: "discountValue", lineIndex: index, maxDiscountMinorUnits: subtotal.minorUnits },
      );
    }
  };

  const discounted = subtotal.subtract(discount);
  const tax = discounted.applyRate(line.taxRateBasisPoints);
  const total = discounted.add(tax);

  return {
    subtotalMinorUnits: subtotal.minorUnits,
    discountMinorUnits: discount.minorUnits,
    discountedMinorUnits: discounted.minorUnits,
    taxMinorUnits: tax.minorUnits,
    totalMinorUnits: total.minorUnits,
  };
};

// Computes every line and the document totals derived from them.
export const computeDocument = (lines: LineItemInput[]): DocumentComputation => {
  const computed = lines.map((line, index) => computeLine(line, index));

  const totals = computed.reduce<DocumentTotals>(
    (accumulator, line) => ({
      subtotalMinorUnits: accumulator.subtotalMinorUnits + line.subtotalMinorUnits,
      totalDiscountMinorUnits: accumulator.totalDiscountMinorUnits + line.discountMinorUnits,
      totalTaxMinorUnits: accumulator.totalTaxMinorUnits + line.taxMinorUnits,
      grandTotalMinorUnits: accumulator.grandTotalMinorUnits + line.totalMinorUnits,
    }),
    {
      subtotalMinorUnits: 0,
      totalDiscountMinorUnits: 0,
      totalTaxMinorUnits: 0,
      grandTotalMinorUnits: 0,
    },
  );

  return { ...totals, lines: computed };
};

// Extra checks applied only when a draft is finalized. Empty documents and
// zero-value lines are acceptable while drafting but not worth freezing.
export const assertDocumentCanBeFinalized = (lines: LineItemInput[]): void => {
  if (lines.length === 0) {
    throw new ValidationError(
      "EMPTY_DOCUMENT",
      "A document needs at least one line item before it can be finalized.",
    );
  }
  computeDocument(lines);
};
