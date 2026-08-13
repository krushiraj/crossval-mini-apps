// Money handling utils.
//
// Representation: integer minor units (cents). No floating point value ever
// reaches the database or takes part in arithmetic.
//
// Rates (discount percent, tax percent) are integer basis points:
// 100% = 10_000 bp, so 5% = 500 bp and 12.5% = 1250 bp.
//
// Rounding policy: HALF-UP (ties away from zero), applied per line at the
// moment a rate is turned into an amount. Sums of already-rounded line amounts
// are exact integer additions, so document totals never round twice.

export type Currency = "USD";

export const DEFAULT_CURRENCY: Currency = "USD";

// 100% expressed in basis points.
export const BASIS_POINTS_PER_UNIT = 10_000;

// Minor units per major unit (cents per dollar).
export const MINOR_UNITS_PER_UNIT = 100;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
};

// Divides two integers and rounds the result to the nearest integer with ties
// going away from zero (HALF_UP in the BigDecimal sense).
//
// Kept as integer arithmetic on purpose: `Math.round(a / b)` would introduce
// binary floating point error and rounds ties towards +Infinity, which is
// asymmetric for negative amounts such as refunds.
export const divideRoundHalfUp = (numerator: number, denominator: number): number => {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new MoneyError("divideRoundHalfUp expects integer operands");
  }
  if (denominator === 0) {
    throw new MoneyError("division by zero");
  }
  const negative = numerator < 0 !== denominator < 0;
  const absNumerator = Math.abs(numerator);
  const absDenominator = Math.abs(denominator);
  const quotient = Math.floor(absNumerator / absDenominator);
  const remainder = absNumerator - quotient * absDenominator;
  const rounded = remainder * 2 >= absDenominator ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
};

const MAJOR_UNIT_PATTERN = /^-?\d+(\.\d+)?$/;

// A currency amount. Immutable; arithmetic returns new instances and is only
// defined between amounts of the same currency.
export class Money {
  private constructor(
    readonly minorUnits: number,
    readonly currency: Currency,
  ) {}

  static fromMinorUnits(minorUnits: number, currency: Currency = DEFAULT_CURRENCY): Money {
    if (!Number.isSafeInteger(minorUnits)) {
      throw new MoneyError(`Amount must be a safe integer number of minor units, received ${minorUnits}`);
    }
    return new Money(minorUnits, currency);
  }

  // Parses a major-unit amount ("1234.56" or 1234.56) into minor units.
  // Strings are parsed digit-by-digit so no float ever holds the value.
  static fromMajorUnits(value: string | number, currency: Currency = DEFAULT_CURRENCY): Money {
    const text = typeof value === "number" ? value.toString() : value.trim();
    if (!MAJOR_UNIT_PATTERN.test(text)) {
      throw new MoneyError(`Cannot parse "${value}" as a currency amount`);
    };
    const negative = text.startsWith("-");
    const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
    if (fraction.length > 2) {
      throw new MoneyError(`Amount "${value}" has more precision than ${currency} supports (2 decimal places)`);
    };
    const padded = fraction.padEnd(2, "0");
    const minorUnits = Number(whole) * MINOR_UNITS_PER_UNIT + Number(padded);
    return Money.fromMinorUnits(negative ? -minorUnits : minorUnits, currency);
  }

  static zero(currency: Currency = DEFAULT_CURRENCY): Money {
    return new Money(0, currency);
  }

  static sum(amounts: Money[], currency: Currency = DEFAULT_CURRENCY): Money {
    return amounts.reduce((total, amount) => total.add(amount), Money.zero(currency));
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new MoneyError(`Cannot combine ${this.currency} with ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinorUnits(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinorUnits(this.minorUnits - other.minorUnits, this.currency);
  }

  // Multiplies by a whole number of units (a line quantity). Exact, no rounding.
  timesQuantity(quantity: number): Money {
    if (!Number.isInteger(quantity)) {
      throw new MoneyError(`Quantity must be a whole number, received ${quantity}`);
    }
    return Money.fromMinorUnits(this.minorUnits * quantity, this.currency);
  }

  // Returns the portion of this amount described by a rate in basis points,
  // rounded half-up to the nearest minor unit. This is the only place in the
  // codebase where a rate becomes an amount.
  applyRate(basisPoints: number): Money {
    if (!Number.isInteger(basisPoints)) {
      throw new MoneyError(`Rate must be an integer number of basis points, received ${basisPoints}`);
    }
    return Money.fromMinorUnits(
      divideRoundHalfUp(this.minorUnits * basisPoints, BASIS_POINTS_PER_UNIT),
      this.currency,
    );
  }

  isZero(): boolean {
    return this.minorUnits === 0;
  }

  isNegative(): boolean {
    return this.minorUnits < 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits > other.minorUnits;
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits < other.minorUnits;
  }

  // Display only — never feed this back into arithmetic.
  toMajorUnits(): number {
    return this.minorUnits / MINOR_UNITS_PER_UNIT;
  }

  format(): string {
    const negative = this.minorUnits < 0;
    const absolute = Math.abs(this.minorUnits);
    const whole = Math.floor(absolute / MINOR_UNITS_PER_UNIT);
    const fraction = absolute - whole * MINOR_UNITS_PER_UNIT;
    const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${negative ? "-" : ""}$${grouped}.${fraction.toString().padStart(2, "0")}`;
  }

  toJSON(): number {
    return this.minorUnits;
  }
};

// Formats a raw minor-unit integer for display without constructing a Money.
export const formatMinorUnits = (minorUnits: number, currency: Currency = DEFAULT_CURRENCY): string => {
  return Money.fromMinorUnits(minorUnits, currency).format();
};

// Converts basis points to a human percentage number (500 -> 5).
export const basisPointsToPercent = (basisPoints: number): number => {
  return basisPoints / (BASIS_POINTS_PER_UNIT / 100);
};

// Converts a human percentage to basis points (5 -> 500), rejecting sub-bp precision.
export const percentToBasisPoints = (percent: number): number => {
  const basisPoints = percent * (BASIS_POINTS_PER_UNIT / 100);
  if (!Number.isInteger(basisPoints)) {
    throw new MoneyError(`Percent ${percent} is more precise than one basis point`);
  };
  return basisPoints;
};
