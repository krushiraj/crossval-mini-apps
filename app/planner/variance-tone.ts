// Spending, so the sign reads backwards: under budget (negative) is green.
// Adding income categories would mean colouring by category, not by sign.

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
