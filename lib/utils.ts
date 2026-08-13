import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

// Null, never NaN or a guess: callers show a field error instead.
// "10,50" is refused because it means ten fifty in Europe and 1050 here.
export const parseAmountToMinorUnits = (input: string): number | null => {
  const trimmed = input.replace(/[\s$]/g, "");
  if (trimmed.includes(",") && !/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(trimmed)) return null;
  const cleaned = trimmed.replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole, fraction = ""] = (negative ? cleaned.slice(1) : cleaned).split(".");
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -minorUnits : minorUnits;
};

export const formatMoney = (minorUnits: number): string => {
  const negative = minorUnits < 0;
  const absolute = Math.abs(minorUnits);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute - whole * 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${fraction.toString().padStart(2, "0")}`;
};

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
