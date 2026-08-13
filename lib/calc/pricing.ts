// Discount first, then tax on what's left. The other order gives a different
// answer.

import { ValidationError } from "@/lib/errors";
import { BASIS_POINTS_PER_UNIT, Money } from "@/lib/money";

export type DiscountType = "percent" | "fixed";

export interface LineItemInput {
  description?: string;
  quantity: number;
  unitPriceMinorUnits: number;
  discountType: DiscountType | null;
  // Basis points for a percent, cents for a fixed amount.
  discountValue: number;
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

// A fixed discount bigger than the line is rejected, not trimmed. Trimming
// would turn a typo into a free line.
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
  }

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

// Only checked at finalize. An empty document is fine to leave lying around as
// a draft, just not to freeze.
export const assertDocumentCanBeFinalized = (lines: LineItemInput[]): void => {
  if (lines.length === 0) {
    throw new ValidationError(
      "EMPTY_DOCUMENT",
      "A document needs at least one line item before it can be finalized.",
    );
  }
  computeDocument(lines);
};
