// Due dates and issue dates are days, not moments in time, so they're kept as
// "YYYY-MM-DD" text. That sorts correctly as a string and has no timezone to
// get wrong.

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isIsoDate = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export const isIsoMonth = (value: string): boolean => {
  return ISO_MONTH_PATTERN.test(value);
};

export const todayIsoDate = (): string => {
  return new Date().toISOString().slice(0, 10);
};

export const monthOf = (isoDate: string): string => {
  return isoDate.slice(0, 7);
};

// Includes both ends.
export const monthsBetween = (fromMonth: string, toMonth: string): string[] => {
  const months: string[] = [];
  let [year, month] = fromMonth.split("-").map(Number);
  const [endYear, endMonth] = toMonth.split("-").map(Number);

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${month.toString().padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
};

export const formatMonth = (month: string): string => {
  const [year, monthNumber] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${name} ${year}`;
};

export const formatIsoDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const name = new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${day} ${name} ${year}`;
};
