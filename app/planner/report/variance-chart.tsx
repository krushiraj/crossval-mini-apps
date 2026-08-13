"use client";

// One bar per month: the sum of (actual − plan) across every category,
// coloured like the table — green under budget, red over. A month with no
// actuals still gets a bar, in grey, so a gap in reporting doesn't look the
// same as being on plan.

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/utils";
import { varianceBarColor } from "@/app/planner/variance-tone";
import type { ReportMonthTotal } from "@/lib/calc/planner";

export const MonthlyVarianceChart = ({ monthTotals }: { monthTotals: ReportMonthTotal[] }) => {
  const data = monthTotals
    .filter((total) => total.month !== "all")
    .map((total) => ({
      month: formatMonth(total.month),
      varianceMajorUnits: total.varianceMinorUnits === null ? 0 : total.varianceMinorUnits / 100,
      hasData: total.varianceMinorUnits !== null,
    }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            width={72}
            tickFormatter={(value: number) => formatMoney(Math.round(value * 100))}
          />
          <Tooltip
            formatter={(value) => formatMoney(Math.round(Number(value) * 100))}
            labelStyle={{ color: "#0f172a", fontWeight: 600 }}
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          <Bar dataKey="varianceMajorUnits" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={varianceBarColor(entry.varianceMajorUnits, entry.hasData)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
