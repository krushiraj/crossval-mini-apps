import { describe, expect, it } from "vitest";

import {
  Money,
  MoneyError,
  divideRoundHalfUp,
  formatMinorUnits,
  percentToBasisPoints,
} from "@/lib/money";

describe("divideRoundHalfUp", () => {
  it("rounds down below the midpoint", () => {
    expect(divideRoundHalfUp(24, 10)).toBe(2);
  });

  it("rounds ties away from zero", () => {
    expect(divideRoundHalfUp(25, 10)).toBe(3);
    expect(divideRoundHalfUp(-25, 10)).toBe(-3);
  });

  it("rounds up above the midpoint", () => {
    expect(divideRoundHalfUp(26, 10)).toBe(3);
    expect(divideRoundHalfUp(-26, 10)).toBe(-3);
  });

  it("is exact where floating point division is not", () => {
    // 0.1 + 0.2 style drift: 1000.15 as minor units taxed at 10% must not
    // become ...4999999 before rounding.
    expect(divideRoundHalfUp(100015 * 1000, 10_000)).toBe(10002); // 10001.5 -> 10002
  });

  it("rejects non-integer operands and division by zero", () => {
    expect(() => divideRoundHalfUp(1.5, 10)).toThrow(MoneyError);
    expect(() => divideRoundHalfUp(10, 0)).toThrow(MoneyError);
  });
});

describe("Money.fromMajorUnits", () => {
  it("parses decimal strings without touching a float", () => {
    expect(Money.fromMajorUnits("100.00").minorUnits).toBe(10_000);
    expect(Money.fromMajorUnits("0.07").minorUnits).toBe(7);
    expect(Money.fromMajorUnits("1234.5").minorUnits).toBe(123_450);
    expect(Money.fromMajorUnits("-20").minorUnits).toBe(-2_000);
  });

  it("rejects amounts with sub-cent precision", () => {
    expect(() => Money.fromMajorUnits("1.005")).toThrow(MoneyError);
  });

  it("rejects values that are not amounts", () => {
    expect(() => Money.fromMajorUnits("abc")).toThrow(MoneyError);
    expect(() => Money.fromMajorUnits("")).toThrow(MoneyError);
  });
});

describe("Money arithmetic", () => {
  it("adds and subtracts exactly", () => {
    const a = Money.fromMajorUnits("0.10");
    const b = Money.fromMajorUnits("0.20");
    expect(a.add(b).minorUnits).toBe(30);
    expect(b.subtract(a).minorUnits).toBe(10);
  });

  it("multiplies by whole quantities without rounding", () => {
    expect(Money.fromMajorUnits("19.99").timesQuantity(3).minorUnits).toBe(5_997);
  });

  it("rejects fractional quantities", () => {
    expect(() => Money.fromMajorUnits("10.00").timesQuantity(1.5)).toThrow(MoneyError);
  });

  it("applies rates with half-up rounding at the cent", () => {
    // 5% of $180.00 = $9.00 exactly
    expect(Money.fromMajorUnits("180.00").applyRate(500).minorUnits).toBe(900);
    // 1% of $0.50 = $0.005 -> ties away from zero -> $0.01
    expect(Money.fromMajorUnits("0.50").applyRate(100).minorUnits).toBe(1);
    // 5% of $0.05 = $0.0025 -> below the midpoint -> $0.00
    expect(Money.fromMajorUnits("0.05").applyRate(500).minorUnits).toBe(0);
  });

  it("refuses to mix currencies", () => {
    const usd = Money.fromMinorUnits(100, "USD");
    const other = Money.fromMinorUnits(100, "EUR" as never);
    expect(() => usd.add(other)).toThrow(MoneyError);
  });

  it("sums a list of amounts", () => {
    const total = Money.sum([
      Money.fromMajorUnits("189.00"),
      Money.fromMajorUnits("52.50"),
      Money.fromMajorUnits("180.00"),
    ]);
    expect(total.minorUnits).toBe(42_150);
  });
});

describe("formatting", () => {
  it("groups thousands and always shows two decimals", () => {
    expect(formatMinorUnits(42_150)).toBe("$421.50");
    expect(formatMinorUnits(100_000_00)).toBe("$100,000.00");
    expect(formatMinorUnits(5)).toBe("$0.05");
    expect(formatMinorUnits(-20_000)).toBe("-$200.00");
  });
});

describe("percentToBasisPoints", () => {
  it("converts human percentages", () => {
    expect(percentToBasisPoints(5)).toBe(500);
    expect(percentToBasisPoints(12.5)).toBe(1_250);
  });

  it("rejects precision finer than one basis point", () => {
    expect(() => percentToBasisPoints(1.234)).toThrow(MoneyError);
  });
});
