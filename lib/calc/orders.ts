// Paid is always the sum of the payment rows; no stored balance to drift.
// assertPaymentAllowed must run inside the insert's transaction.

import { ConflictError, ValidationError } from "@/lib/errors";
import { Money } from "@/lib/money";

export type OrderStatus = "pending" | "partially_paid" | "paid" | "overdue";

export interface OrderLineItemInput {
  description?: string;
  quantity: number;
  unitPriceMinorUnits: number;
}

export interface OrderLineTotal {
  lineTotalMinorUnits: number;
}

export interface OrderTotals {
  subtotalMinorUnits: number;
  totalMinorUnits: number;
  lines: OrderLineTotal[];
}

const assertLineIsValid = (line: OrderLineItemInput, index: number): void => {
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
};

// Whole numbers throughout, so nothing here rounds.
export const computeOrderTotal = (lines: OrderLineItemInput[]): OrderTotals => {
  if (lines.length === 0) {
    throw new ValidationError("EMPTY_ORDER", "An order needs at least one line item.");
  }

  const computedLines = lines.map((line, index) => {
    assertLineIsValid(line, index);
    const lineTotal = Money.fromMinorUnits(line.unitPriceMinorUnits).timesQuantity(line.quantity);
    return { lineTotalMinorUnits: lineTotal.minorUnits };
  });

  const totalMinorUnits = computedLines.reduce((sum, line) => sum + line.lineTotalMinorUnits, 0);

  return {
    subtotalMinorUnits: totalMinorUnits,
    totalMinorUnits,
    lines: computedLines,
  };
};

// Not in computeOrderTotal, so the preview still shows $0.00 while typing.
export const assertOrderIsPayable = (totalMinorUnits: number): void => {
  if (totalMinorUnits < 1) {
    throw new ValidationError(
      "ZERO_TOTAL_ORDER",
      "An order must come to at least $0.01. Check the unit prices.",
      { field: "lines" },
    );
  }
};

// Paid beats overdue, overdue beats partly paid. Due today isn't late yet.
export const deriveStatus = ({
  totalMinorUnits,
  paidMinorUnits,
  dueDate,
  today,
}: {
  totalMinorUnits: number;
  paidMinorUnits: number;
  dueDate: string;
  today: string;
}): OrderStatus => {
  // Nothing owed is not the same as settled.
  if (totalMinorUnits <= 0) {
    return "pending";
  }
  if (paidMinorUnits >= totalMinorUnits) {
    return "paid";
  }
  if (today > dueDate) {
    return "overdue";
  }
  if (paidMinorUnits > 0) {
    return "partially_paid";
  }
  return "pending";
};

// alreadyPaid must be read inside the insert's transaction, or two payments
// at once could both pass.
export const assertPaymentAllowed = ({
  totalMinorUnits,
  alreadyPaidMinorUnits,
  amountMinorUnits,
}: {
  totalMinorUnits: number;
  alreadyPaidMinorUnits: number;
  amountMinorUnits: number;
}): void => {
  if (!Number.isInteger(amountMinorUnits) || amountMinorUnits < 1) {
    throw new ValidationError(
      "INVALID_PAYMENT_AMOUNT",
      "Payment amount must be at least $0.01.",
      { field: "amount" },
    );
  }

  const maxAllowedMinorUnits = totalMinorUnits - alreadyPaidMinorUnits;

  if (amountMinorUnits > maxAllowedMinorUnits) {
    const attempted = Money.fromMinorUnits(amountMinorUnits);
    const maxAllowed = Money.fromMinorUnits(Math.max(maxAllowedMinorUnits, 0));
    throw new ConflictError(
      "OVER_PAYMENT",
      `Payment of ${attempted.format()} exceeds the amount due. The maximum you can record is ${maxAllowed.format()}.`,
      { maxAllowedMinorUnits: Math.max(maxAllowedMinorUnits, 0) },
    );
  }
};

export interface OrderPaymentInput {
  amountMinorUnits: number;
}

// Added up from the payments every time, never read from a stored balance.
export const computeOrderSummary = ({
  totalMinorUnits,
  payments,
  dueDate,
  today,
}: {
  totalMinorUnits: number;
  payments: OrderPaymentInput[];
  dueDate: string;
  today: string;
}): { paidMinorUnits: number; dueMinorUnits: number; status: OrderStatus } => {
  const paidMinorUnits = payments.reduce((sum, payment) => sum + payment.amountMinorUnits, 0);
  const dueMinorUnits = Math.max(totalMinorUnits - paidMinorUnits, 0);
  const status = deriveStatus({ totalMinorUnits, paidMinorUnits, dueDate, today });
  return { paidMinorUnits, dueMinorUnits, status };
};
