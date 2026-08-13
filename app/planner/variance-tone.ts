// Colour rules for a spending variance, kept in one place so the table, the
// month grid, the summary stat and the chart always agree.
//
// Variance is actual minus plan. Because these are *spending* categories,
// the sign is backwards from the usual financial convention:
//
//   - Negative (spent less than planned) = under budget = green
//   - Positive (spent more than planned) = over budget = red
//   - Exactly on plan, or nothing logged = neutral
//
// If income categories are ever added, this coloring needs to depend on the
// category type, not just the sign.

export type VarianceTone = "default" | "positive" | "negative";

export const varianceTone = (value: number | null): VarianceTone => {
  if (value === null || value === 0) return "default";
  return value < 0 ? "positive" : "negative";
};

export const varianceTextClass = (value: number | null): string => {
  switch (varianceTone(value)) {
    case "positive":
      return "text-emerald-700";
    case "negative":
      return "text-red-600";
    default:
      return "text-slate-500";
  }
};

// Chart bar fills, matching the table colours above.
export const VARIANCE_COLORS = {
  underBudget: "#047857", // emerald-700
  overBudget: "#dc2626", // red-600
  onPlan: "#64748b", // slate-500
  noData: "#cbd5e1", // slate-300
} as const;

export const varianceBarColor = (value: number, hasData: boolean): string => {
  if (!hasData) return VARIANCE_COLORS.noData;
  if (value === 0) return VARIANCE_COLORS.onPlan;
  return value < 0 ? VARIANCE_COLORS.underBudget : VARIANCE_COLORS.overBudget;
};
