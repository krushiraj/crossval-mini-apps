import { describe, expect, it } from "vitest";

import { parseAmountToMinorUnits } from "@/lib/utils";

describe("reading an amount someone typed", () => {
  it("accepts the ordinary shapes", () => {
    expect(parseAmountToMinorUnits("25")).toBe(2_500);
    expect(parseAmountToMinorUnits("25.00")).toBe(2_500);
    expect(parseAmountToMinorUnits("7.77")).toBe(777);
    expect(parseAmountToMinorUnits("0.05")).toBe(5);
    expect(parseAmountToMinorUnits("-5.00")).toBe(-500);
  });

  it("ignores spaces and a currency symbol", () => {
    expect(parseAmountToMinorUnits("  25  ")).toBe(2_500);
    expect(parseAmountToMinorUnits("$25.00")).toBe(2_500);
  });

  it("accepts commas only as thousands separators", () => {
    expect(parseAmountToMinorUnits("1,234.56")).toBe(123_456);
    expect(parseAmountToMinorUnits("1,234")).toBe(123_400);
  });

  // Ambiguous: ten fifty in Europe, 1050 here. Guessing is wrong by 100x.
  it("refuses a comma that could be a decimal point", () => {
    expect(parseAmountToMinorUnits("10,50")).toBeNull();
    expect(parseAmountToMinorUnits("1,23")).toBeNull();
    expect(parseAmountToMinorUnits("1,2345")).toBeNull();
    expect(parseAmountToMinorUnits("12,34,567")).toBeNull();
  });

  // Callers used to fall back to 0, making a mistyped price a free line.
  it("refuses anything it cannot read, rather than guessing", () => {
    for (const input of ["7.777", "12.345", "abc", "", "1e5", "--5", "5.", ".5.5"]) {
      expect(parseAmountToMinorUnits(input)).toBeNull();
    }
  });
});
