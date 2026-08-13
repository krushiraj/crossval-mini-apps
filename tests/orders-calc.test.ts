import { describe, expect, it } from "vitest";

import {
  assertPaymentAllowed,
  computeOrderSummary,
  computeOrderTotal,
  deriveStatus,
} from "@/lib/calc/orders";
import type { OrderLineItemInput } from "@/lib/calc/orders";
import { ConflictError, ValidationError } from "@/lib/errors";

// The worked example from the assignment brief.
const SAMPLE_LINES: OrderLineItemInput[] = [
  { description: "Widget", quantity: 2, unitPriceMinorUnits: 50_000 }, // 2 x $500.00
];

describe("computeOrderTotal", () => {
  it("computes the sample scenario: 2 x $500 = $1,000", () => {
    const result = computeOrderTotal(SAMPLE_LINES);
    expect(result.subtotalMinorUnits).toBe(100_000);
    expect(result.totalMinorUnits).toBe(100_000);
    expect(result.lines).toEqual([{ lineTotalMinorUnits: 100_000 }]);
  });

  it("sums multiple lines exactly", () => {
    const result = computeOrderTotal([
      { quantity: 1, unitPriceMinorUnits: 1_099 },
      { quantity: 3, unitPriceMinorUnits: 250 },
    ]);
    expect(result.lines).toEqual([{ lineTotalMinorUnits: 1_099 }, { lineTotalMinorUnits: 750 }]);
    expect(result.totalMinorUnits).toBe(1_849);
  });

  it("rejects an order with no lines", () => {
    expect(() => computeOrderTotal([])).toThrow(ValidationError);
  });

  it("rejects a quantity below 1", () => {
    expect(() =>
      computeOrderTotal([{ quantity: 0, unitPriceMinorUnits: 100 }]),
    ).toThrow(ValidationError);
    expect(() =>
      computeOrderTotal([{ quantity: -1, unitPriceMinorUnits: 100 }]),
    ).toThrow(ValidationError);
  });

  it("rejects a fractional quantity", () => {
    expect(() =>
      computeOrderTotal([{ quantity: 1.5, unitPriceMinorUnits: 100 }]),
    ).toThrow(ValidationError);
  });

  it("rejects a negative unit price", () => {
    expect(() =>
      computeOrderTotal([{ quantity: 1, unitPriceMinorUnits: -1 }]),
    ).toThrow(ValidationError);
  });

  it("rejects a fractional unit price (minor units must be integers)", () => {
    expect(() =>
      computeOrderTotal([{ quantity: 1, unitPriceMinorUnits: 100.5 }]),
    ).toThrow(ValidationError);
  });

  it("accepts a zero unit price (free line)", () => {
    const result = computeOrderTotal([{ quantity: 1, unitPriceMinorUnits: 0 }]);
    expect(result.totalMinorUnits).toBe(0);
  });

  it("names the offending line in the message", () => {
    try {
      computeOrderTotal([
        { quantity: 1, unitPriceMinorUnits: 100 },
        { quantity: 0, unitPriceMinorUnits: 100 },
      ]);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("Line 2");
      expect((error as ValidationError).details?.lineIndex).toBe(1);
    }
  });
});

describe("deriveStatus", () => {
  const TOTAL = 100_000; // $1,000
  const DUE = "2026-01-10";

  it("pending: no payments recorded, not past due", () => {
    expect(
      deriveStatus({ totalMinorUnits: TOTAL, paidMinorUnits: 0, dueDate: DUE, today: "2026-01-05" }),
    ).toBe("pending");
  });

  it("pending: due date is today (not yet overdue)", () => {
    expect(
      deriveStatus({ totalMinorUnits: TOTAL, paidMinorUnits: 0, dueDate: DUE, today: DUE }),
    ).toBe("pending");
  });

  it("partially_paid: some payment, less than total, not past due", () => {
    expect(
      deriveStatus({
        totalMinorUnits: TOTAL,
        paidMinorUnits: 40_000,
        dueDate: DUE,
        today: "2026-01-05",
      }),
    ).toBe("partially_paid");
  });

  it("paid: total payments equal order total", () => {
    expect(
      deriveStatus({
        totalMinorUnits: TOTAL,
        paidMinorUnits: TOTAL,
        dueDate: DUE,
        today: "2026-01-05",
      }),
    ).toBe("paid");
  });

  it("overdue: past due date, nothing paid", () => {
    expect(
      deriveStatus({ totalMinorUnits: TOTAL, paidMinorUnits: 0, dueDate: DUE, today: "2026-01-11" }),
    ).toBe("overdue");
  });

  it("overdue: past due date, partially paid", () => {
    expect(
      deriveStatus({
        totalMinorUnits: TOTAL,
        paidMinorUnits: 50_000,
        dueDate: DUE,
        today: "2026-01-11",
      }),
    ).toBe("overdue");
  });

  it("edge case — paid wins over overdue: fully paid after the due date passed", () => {
    expect(
      deriveStatus({
        totalMinorUnits: TOTAL,
        paidMinorUnits: TOTAL,
        dueDate: DUE,
        today: "2026-01-11",
      }),
    ).toBe("paid");
  });

  it("treats overpaid totals (paid > total) as paid, never a distinct status", () => {
    expect(
      deriveStatus({
        totalMinorUnits: TOTAL,
        paidMinorUnits: TOTAL + 1,
        dueDate: DUE,
        today: "2026-01-05",
      }),
    ).toBe("paid");
  });

  it("a zero-total order is paid immediately (nothing left to collect)", () => {
    expect(
      deriveStatus({ totalMinorUnits: 0, paidMinorUnits: 0, dueDate: DUE, today: "2026-01-11" }),
    ).toBe("paid");
  });
});

describe("assertPaymentAllowed", () => {
  it("allows a payment strictly under the remaining balance", () => {
    expect(() =>
      assertPaymentAllowed({
        totalMinorUnits: 100_000,
        alreadyPaidMinorUnits: 0,
        amountMinorUnits: 40_000,
      }),
    ).not.toThrow();
  });

  it("allows a payment that exactly settles the remaining balance", () => {
    expect(() =>
      assertPaymentAllowed({
        totalMinorUnits: 100_000,
        alreadyPaidMinorUnits: 40_000,
        amountMinorUnits: 60_000,
      }),
    ).not.toThrow();
  });

  it("rejects a payment that would exceed the total, naming the max allowed amount", () => {
    try {
      assertPaymentAllowed({
        totalMinorUnits: 60_000, // $600 remaining (sample scenario, step 3 already settled)
        alreadyPaidMinorUnits: 60_000,
        amountMinorUnits: 100, // $1.00 more, but nothing is left
      });
      throw new Error("expected the payment to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      const conflict = error as ConflictError;
      expect(conflict.code).toBe("OVER_PAYMENT");
      expect(conflict.details?.maxAllowedMinorUnits).toBe(0);
      expect(conflict.message).toContain("maximum you can record is $0.00");
    }
  });

  it("matches the brief's phrasing for a $601 payment against a $600 balance", () => {
    try {
      assertPaymentAllowed({
        totalMinorUnits: 60_000,
        alreadyPaidMinorUnits: 0,
        amountMinorUnits: 60_100, // $601.00
      });
      throw new Error("expected the payment to be rejected");
    } catch (error) {
      const conflict = error as ConflictError;
      expect(conflict.message).toBe(
        "Payment of $601.00 exceeds the amount due. The maximum you can record is $600.00.",
      );
      expect(conflict.details?.maxAllowedMinorUnits).toBe(60_000);
    }
  });

  it("rejects a zero amount", () => {
    expect(() =>
      assertPaymentAllowed({ totalMinorUnits: 1_000, alreadyPaidMinorUnits: 0, amountMinorUnits: 0 }),
    ).toThrow(ValidationError);
  });

  it("rejects a negative amount", () => {
    expect(() =>
      assertPaymentAllowed({ totalMinorUnits: 1_000, alreadyPaidMinorUnits: 0, amountMinorUnits: -100 }),
    ).toThrow(ValidationError);
  });

  it("rejects an amount below the $0.01 minimum in fractional-cent form", () => {
    expect(() =>
      assertPaymentAllowed({
        totalMinorUnits: 1_000,
        alreadyPaidMinorUnits: 0,
        amountMinorUnits: 0.5,
      }),
    ).toThrow(ValidationError);
  });
});

describe("sample scenario end to end", () => {
  const DUE_DATE = "2026-01-18"; // 7 days out from an arbitrary "today"
  const TODAY = "2026-01-11";

  it("2 x $500 order, $400 payment -> partially_paid, $600 due", () => {
    const order = computeOrderTotal(SAMPLE_LINES);
    expect(order.totalMinorUnits).toBe(100_000);

    assertPaymentAllowed({
      totalMinorUnits: order.totalMinorUnits,
      alreadyPaidMinorUnits: 0,
      amountMinorUnits: 40_000,
    });

    const summary = computeOrderSummary({
      totalMinorUnits: order.totalMinorUnits,
      payments: [{ amountMinorUnits: 40_000 }],
      dueDate: DUE_DATE,
      today: TODAY,
    });

    expect(summary.status).toBe("partially_paid");
    expect(summary.paidMinorUnits).toBe(40_000);
    expect(summary.dueMinorUnits).toBe(60_000);
  });

  it("further $600 payment -> paid, $0 due", () => {
    const order = computeOrderTotal(SAMPLE_LINES);

    assertPaymentAllowed({
      totalMinorUnits: order.totalMinorUnits,
      alreadyPaidMinorUnits: 40_000,
      amountMinorUnits: 60_000,
    });

    const summary = computeOrderSummary({
      totalMinorUnits: order.totalMinorUnits,
      payments: [{ amountMinorUnits: 40_000 }, { amountMinorUnits: 60_000 }],
      dueDate: DUE_DATE,
      today: TODAY,
    });

    expect(summary.status).toBe("paid");
    expect(summary.paidMinorUnits).toBe(100_000);
    expect(summary.dueMinorUnits).toBe(0);
  });

  it("a further $1 payment attempt is rejected with the max-allowed message", () => {
    const order = computeOrderTotal(SAMPLE_LINES);

    expect(() =>
      assertPaymentAllowed({
        totalMinorUnits: order.totalMinorUnits,
        alreadyPaidMinorUnits: 100_000,
        amountMinorUnits: 100, // $1.00
      }),
    ).toThrow(ConflictError);

    try {
      assertPaymentAllowed({
        totalMinorUnits: order.totalMinorUnits,
        alreadyPaidMinorUnits: 100_000,
        amountMinorUnits: 100,
      });
    } catch (error) {
      const conflict = error as ConflictError;
      expect(conflict.message).toContain("maximum you can record is $0.00");
      expect(conflict.details?.maxAllowedMinorUnits).toBe(0);
    }
  });
});

describe("computeOrderSummary", () => {
  it("computes paid/due/status together from a payment ledger", () => {
    const summary = computeOrderSummary({
      totalMinorUnits: 10_000,
      payments: [{ amountMinorUnits: 3_000 }, { amountMinorUnits: 2_000 }],
      dueDate: "2026-02-01",
      today: "2026-01-01",
    });
    expect(summary.paidMinorUnits).toBe(5_000);
    expect(summary.dueMinorUnits).toBe(5_000);
    expect(summary.status).toBe("partially_paid");
  });

  it("clamps dueMinorUnits at zero even if payments somehow exceed total", () => {
    const summary = computeOrderSummary({
      totalMinorUnits: 10_000,
      payments: [{ amountMinorUnits: 12_000 }],
      dueDate: "2026-02-01",
      today: "2026-01-01",
    });
    expect(summary.dueMinorUnits).toBe(0);
    expect(summary.status).toBe("paid");
  });

  it("with an empty payment ledger the order is pending", () => {
    const summary = computeOrderSummary({
      totalMinorUnits: 10_000,
      payments: [],
      dueDate: "2026-02-01",
      today: "2026-01-01",
    });
    expect(summary.status).toBe("pending");
    expect(summary.paidMinorUnits).toBe(0);
    expect(summary.dueMinorUnits).toBe(10_000);
  });
});
