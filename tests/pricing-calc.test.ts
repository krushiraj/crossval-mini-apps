import { describe, expect, it } from "vitest";

import { assertDocumentCanBeFinalized, computeDocument, computeLine } from "@/lib/calc/pricing";
import type { LineItemInput } from "@/lib/calc/pricing";
import { ValidationError } from "@/lib/errors";

// The worked example from the assignment brief.
const SAMPLE_DOCUMENT: LineItemInput[] = [
  {
    description: "Widget A",
    quantity: 2,
    unitPriceMinorUnits: 10_000, // $100.00
    discountType: "percent",
    discountValue: 1_000, // 10%
    taxRateBasisPoints: 500, // 5%
  },
  {
    description: "Widget B",
    quantity: 1,
    unitPriceMinorUnits: 5_000, // $50.00
    discountType: null,
    discountValue: 0,
    taxRateBasisPoints: 500, // 5%
  },
  {
    description: "Service fee",
    quantity: 1,
    unitPriceMinorUnits: 20_000, // $200.00
    discountType: "fixed",
    discountValue: 2_000, // $20.00
    taxRateBasisPoints: 0,
  },
];

describe("sample document from the brief", () => {
  const result = computeDocument(SAMPLE_DOCUMENT);

  it("matches the expected per-line results", () => {
    expect(result.lines[0]).toEqual({
      subtotalMinorUnits: 20_000, // 200.00
      discountMinorUnits: 2_000, // 20.00
      discountedMinorUnits: 18_000, // 180.00
      taxMinorUnits: 900, // 9.00
      totalMinorUnits: 18_900, // 189.00
    });

    expect(result.lines[1]).toEqual({
      subtotalMinorUnits: 5_000, // 50.00
      discountMinorUnits: 0,
      discountedMinorUnits: 5_000, // 50.00
      taxMinorUnits: 250, // 2.50
      totalMinorUnits: 5_250, // 52.50
    });

    expect(result.lines[2]).toEqual({
      subtotalMinorUnits: 20_000, // 200.00
      discountMinorUnits: 2_000, // 20.00
      discountedMinorUnits: 18_000, // 180.00
      taxMinorUnits: 0,
      totalMinorUnits: 18_000, // 180.00
    });
  });

  it("matches the expected document totals", () => {
    expect(result.subtotalMinorUnits).toBe(45_000); // 450.00
    expect(result.totalDiscountMinorUnits).toBe(4_000); // 40.00
    expect(result.totalTaxMinorUnits).toBe(1_150); // 11.50
    expect(result.grandTotalMinorUnits).toBe(42_150); // 421.50
  });

  it("reconciles: grand total === subtotal - discount + tax", () => {
    expect(result.grandTotalMinorUnits).toBe(
      result.subtotalMinorUnits - result.totalDiscountMinorUnits + result.totalTaxMinorUnits,
    );
  });
});

describe("order of operations", () => {
  it("applies the discount before the tax", () => {
    // 5% of the discounted 180.00 is 9.00, not 5% of the 200.00 subtotal (10.00).
    const line = computeLine(SAMPLE_DOCUMENT[0]);
    expect(line.taxMinorUnits).toBe(900);
  });

  it("taxes the full subtotal when there is no discount", () => {
    const line = computeLine({
      quantity: 1,
      unitPriceMinorUnits: 20_000,
      discountType: null,
      discountValue: 0,
      taxRateBasisPoints: 500,
    });
    expect(line.taxMinorUnits).toBe(1_000);
    expect(line.totalMinorUnits).toBe(21_000);
  });
});

describe("rounding policy: half-up, per line", () => {
  it("rounds a half-cent discount away from zero", () => {
    // 10% of $0.05 = $0.005 -> $0.01
    const line = computeLine({
      quantity: 1,
      unitPriceMinorUnits: 5,
      discountType: "percent",
      discountValue: 1_000,
      taxRateBasisPoints: 0,
    });
    expect(line.discountMinorUnits).toBe(1);
    expect(line.totalMinorUnits).toBe(4);
  });

  it("rounds each line independently, then sums exactly", () => {
    // Three lines that each round up by half a cent: the document total is the
    // sum of the rounded lines (3 cents of tax), never a re-rounded aggregate.
    const lines: LineItemInput[] = Array.from({ length: 3 }, () => ({
      quantity: 1,
      unitPriceMinorUnits: 50,
      discountType: null,
      discountValue: 0,
      taxRateBasisPoints: 100, // 1% of $0.50 = $0.005 -> $0.01
    }));
    const document = computeDocument(lines);
    expect(document.totalTaxMinorUnits).toBe(3);
    expect(document.grandTotalMinorUnits).toBe(153);
  });
});

describe("validation", () => {
  const validLine: LineItemInput = {
    quantity: 1,
    unitPriceMinorUnits: 1_000,
    discountType: null,
    discountValue: 0,
    taxRateBasisPoints: 0,
  };

  it("rejects a quantity below 1", () => {
    expect(() => computeLine({ ...validLine, quantity: 0 })).toThrow(ValidationError);
    expect(() => computeLine({ ...validLine, quantity: -2 })).toThrow(ValidationError);
  });

  it("rejects a fractional quantity", () => {
    expect(() => computeLine({ ...validLine, quantity: 1.5 })).toThrow(ValidationError);
  });

  it("rejects a negative unit price", () => {
    expect(() => computeLine({ ...validLine, unitPriceMinorUnits: -1 })).toThrow(ValidationError);
  });

  it("rejects a discount percent above 100", () => {
    expect(() =>
      computeLine({ ...validLine, discountType: "percent", discountValue: 10_001 }),
    ).toThrow(ValidationError);
  });

  it("rejects a negative tax percent", () => {
    expect(() => computeLine({ ...validLine, taxRateBasisPoints: -100 })).toThrow(ValidationError);
  });

  it("rejects a fixed discount larger than the line subtotal, reporting the maximum", () => {
    try {
      computeLine({
        ...validLine,
        unitPriceMinorUnits: 1_000,
        discountType: "fixed",
        discountValue: 1_001,
      });
      throw new Error("expected the discount to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.code).toBe("DISCOUNT_EXCEEDS_SUBTOTAL");
      expect(validationError.details?.maxDiscountMinorUnits).toBe(1_000);
    }
  });

  it("accepts a fixed discount exactly equal to the line subtotal", () => {
    const line = computeLine({
      ...validLine,
      unitPriceMinorUnits: 1_000,
      discountType: "fixed",
      discountValue: 1_000,
    });
    expect(line.totalMinorUnits).toBe(0);
  });

  it("names the offending line in the message", () => {
    try {
      computeDocument([validLine, { ...validLine, quantity: 0 }]);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect((error as ValidationError).message).toContain("Line 2");
      expect((error as ValidationError).details?.lineIndex).toBe(1);
    }
  });
});

describe("finalize preconditions", () => {
  it("refuses to finalize a document with no lines", () => {
    expect(() => assertDocumentCanBeFinalized([])).toThrow(ValidationError);
  });

  it("allows finalizing a valid document", () => {
    expect(() => assertDocumentCanBeFinalized(SAMPLE_DOCUMENT)).not.toThrow();
  });
});

describe("empty document", () => {
  it("computes zero totals", () => {
    expect(computeDocument([])).toEqual({
      subtotalMinorUnits: 0,
      totalDiscountMinorUnits: 0,
      totalTaxMinorUnits: 0,
      grandTotalMinorUnits: 0,
      lines: [],
    });
  });
});
