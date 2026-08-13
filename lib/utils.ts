import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

// Parses a user-entered amount ("1,234.56") into integer minor units.
// Returns null when the text is not a valid amount, so callers can show a
// field-level message instead of silently sending NaN to the server.
export const parseAmountToMinorUnits = (input: string): number | null => {
  const cleaned = input.replace(/[,\s$]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole, fraction = ""] = (negative ? cleaned.slice(1) : cleaned).split(".");
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -minorUnits : minorUnits;
};

// Renders integer minor units as "$1,234.56".
export const formatMoney = (minorUnits: number): string => {
  const negative = minorUnits < 0;
  const absolute = Math.abs(minorUnits);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute - whole * 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${fraction.toString().padStart(2, "0")}`;
};

// Renders minor units as a plain editable string ("1234.56") for form inputs.
export const minorUnitsToInput = (minorUnits: number): string => {
  return (minorUnits / 100).toFixed(2);
};

export const basisPointsToPercentInput = (basisPoints: number): string => {
  return (basisPoints / 100).toString();
};

export const percentInputToBasisPoints = (input: string): number | null => {
  const cleaned = input.replace(/[\s%]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
};
