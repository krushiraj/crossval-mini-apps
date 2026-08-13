"use client";

import * as React from "react";

import { Label, Select } from "@/components/ui";

// Month selector backed by two dropdowns, producing a "YYYY-MM" value.
//
// `<input type="month">` is a plain text box in Safari and Firefox — the user
// ends up typing "2026-07" by hand and guessing the format. Two dropdowns
// work the same everywhere and can't hold an invalid month.

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Years offered around today, widened to always include the current value.
const yearOptions = (selectedYear: number): number[] => {
  const thisYear = new Date().getUTCFullYear();
  const first = Math.min(thisYear - 3, selectedYear);
  const last = Math.max(thisYear + 3, selectedYear);
  const years: number[] = [];
  for (let year = first; year <= last; year += 1) years.push(year);
  return years;
};

export const MonthPicker = ({
  label,
  value,
  onChange,
  disabled,
}: {
  // Used for the visible label and to name each dropdown for assistive tech.
  label: string;
  // "YYYY-MM"
  value: string;
  onChange: (month: string) => void;
  disabled?: boolean;
}) => {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  const emit = (nextYear: number, nextMonthIndex: number) => {
    onChange(`${nextYear}-${String(nextMonthIndex + 1).padStart(2, "0")}`);
  };

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select
          aria-label={`${label} month`}
          className="w-32"
          value={monthIndex}
          disabled={disabled}
          onChange={(event) => emit(year, Number(event.target.value))}
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={`${label} year`}
          className="w-24"
          value={year}
          disabled={disabled}
          onChange={(event) => emit(Number(event.target.value), monthIndex)}
        >
          {yearOptions(year).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
};
