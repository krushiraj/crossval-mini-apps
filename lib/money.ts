// Every amount here is a whole number of cents, so no decimal ever reaches the
// database or takes part in a sum. Percentages are whole basis points, so 5%
// is 500.
//
// Rounding is half-up and happens in exactly one place: applyRate, when a
// percentage becomes an amount. Everything after that is adding whole numbers,
// so nothing gets rounded twice.

export type Currency = "USD";

export const DEFAULT_CURRENCY: Currency = "USD";

export const BASIS_POINTS_PER_UNIT = 10_000;

export const MINOR_UNITS_PER_UNIT = 100;

// Keeps quantity x price well inside Number.MAX_SAFE_INTEGER.
export const MAX_MINOR_UNITS = 1_000_000_000;
export const MAX_QUANTITY = 1_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
};

// Rounds half away from zero, using whole numbers throughout.
// Math.round(a / b) would be wrong twice over: it adds floating point error,
// and it rounds .5 upwards, which treats a refund differently from a charge.
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

// Amounts can only be combined with amounts in the same currency.
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

  // Splits on the dot and reads each side as a whole number, so "1234.56"
  // never exists as 1234.56 in memory.
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

  timesQuantity(quantity: number): Money {
    if (!Number.isInteger(quantity)) {
      throw new MoneyError(`Quantity must be a whole number, received ${quantity}`);
    }
    return Money.fromMinorUnits(this.minorUnits * quantity, this.currency);
  }

  // The only place a percentage turns into an amount, and so the only place
  // anything is rounded.
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

  // For display. Don't calculate with the result.
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

export const formatMinorUnits = (minorUnits: number, currency: Currency = DEFAULT_CURRENCY): string => {
  return Money.fromMinorUnits(minorUnits, currency).format();
};

export const basisPointsToPercent = (basisPoints: number): number => {
  return basisPoints / (BASIS_POINTS_PER_UNIT / 100);
};

// Rejects anything finer than a basis point.
export const percentToBasisPoints = (percent: number): number => {
  const basisPoints = percent * (BASIS_POINTS_PER_UNIT / 100);
  if (!Number.isInteger(basisPoints)) {
    throw new MoneyError(`Percent ${percent} is more precise than one basis point`);
  };
  return basisPoints;
};
