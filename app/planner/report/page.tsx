"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/utils";
import { Button, Card, CardBody, CardHeader, EmptyState, LoadingRow, Stat, Table, Td, Th } from "@/components/ui";
import { PageHeader } from "@/components/app-shell";
import { plannerApi, plannerKeys } from "@/app/planner/_api";
import { MonthlyVarianceChart } from "@/app/planner/report/variance-chart";
import { MonthPicker } from "@/app/planner/month-picker";
import { varianceTextClass, varianceTone } from "@/app/planner/variance-tone";

const currentMonth = (): string => {
  return new Date().toISOString().slice(0, 7);
};

const startOfCurrentYear = (): string => {
  return `${new Date().getUTCFullYear()}-01`;
};

const ReportPage = () => {
  const [from, setFrom] = React.useState(startOfCurrentYear);
  const [to, setTo] = React.useState(currentMonth);
  const [appliedFrom, setAppliedFrom] = React.useState(from);
  const [appliedTo, setAppliedTo] = React.useState(to);

  const rangeValid = appliedFrom <= appliedTo;

  const reportQuery = useQuery({
    queryKey: plannerKeys.report(appliedFrom, appliedTo),
    queryFn: () => plannerApi.getReport(appliedFrom, appliedTo),
    enabled: rangeValid,
  });

  const applyRange = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const exportCsv = () => {
    const report = reportQuery.data;
    if (!report) return;

    const escape = (cell: string) => (cell.includes(",") || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell);
    const header = ["Category", "Month", "Plan", "Actual", "Variance", "Variance %"].join(",");
    const lines = report.rows.map((row) =>
      [
        row.categoryName,
        row.month,
        (row.planMinorUnits / 100).toFixed(2),
        row.actualMinorUnits === null ? "" : (row.actualMinorUnits / 100).toFixed(2),
        row.varianceMinorUnits === null ? "" : (row.varianceMinorUnits / 100).toFixed(2),
        row.variancePercent === null ? "" : row.variancePercent.toFixed(2),
      ]
        .map(escape)
        .join(","),
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plan-vs-actual-${appliedFrom}-to-${appliedTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const report = reportQuery.data;

  return (
    <div>
      <PageHeader
        title="Variance report"
        description="Compare targets to logged spend across a date range."
        action={
          report && report.rows.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6">
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" onSubmit={applyRange}>
            <MonthPicker label="From" value={from} onChange={setFrom} />
            <MonthPicker label="To" value={to} onChange={setTo} />
            <Button type="submit">Apply</Button>
            {!rangeValid ? (
              <p className="text-xs text-red-600">&ldquo;From&rdquo; must be on or before &ldquo;To&rdquo;.</p>
            ) : null}
          </form>
        </CardBody>
      </Card>

      {reportQuery.isLoading ? (
        <Card>
          <LoadingRow />
        </Card>
      ) : !report || report.rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No data in this range"
            description="Set some targets or log actuals for these months, then try again."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Total plan" value={formatMoney(report.overallTotal.planMinorUnits)} />
            <Stat
              label="Total actual"
              value={report.overallTotal.actualMinorUnits === null ? "—" : formatMoney(report.overallTotal.actualMinorUnits)}
            />
            <Stat
              label="Total variance"
              value={
                report.overallTotal.varianceMinorUnits === null
                  ? "—"
                  : formatMoney(report.overallTotal.varianceMinorUnits)
              }
              tone={varianceTone(report.overallTotal.varianceMinorUnits)}
            />
          </div>

          <Card>
            <CardHeader title="Monthly net variance" description="Actual minus plan, summed across categories" />
            <CardBody>
              <MonthlyVarianceChart monthTotals={report.monthTotals} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Category x month detail" />
            <Table className="min-w-[48rem]">
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th>Month</Th>
                  <Th>Plan</Th>
                  <Th>Actual</Th>
                  <Th>Variance</Th>
                  <Th>Variance %</Th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={`${row.categoryId}:${row.month}`}>
                    <Td>{row.categoryName}</Td>
                    <Td>{formatMonth(row.month)}</Td>
                    <Td className="tabular-nums">{formatMoney(row.planMinorUnits)}</Td>
                    <Td className="tabular-nums">
                      {row.actualMinorUnits === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        formatMoney(row.actualMinorUnits)
                      )}
                    </Td>
                    <Td className={`tabular-nums ${varianceTextClass(row.varianceMinorUnits)}`}>
                      {row.varianceMinorUnits === null ? "—" : formatMoney(row.varianceMinorUnits)}
                    </Td>
                    <Td className={`tabular-nums ${varianceTextClass(row.variancePercent)}`}>
                      {row.variancePercent === null
                        ? "—"
                        : `${row.variancePercent > 0 ? "+" : ""}${row.variancePercent.toFixed(2)}%`}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ReportPage;
