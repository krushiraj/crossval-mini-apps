"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader, Field, Input, Stat } from "@/components/ui";
import { ApiError, api } from "@/lib/api-client";
import { monthOf, todayIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/utils";

import type { PricingReport } from "../_types";

const firstOfMonth = (isoDate: string): string => {
  return `${monthOf(isoDate)}-01`;
};

const PricingReportPage = () => {
  const today = todayIsoDate();
  const [from, setFrom] = React.useState(firstOfMonth(today));
  const [to, setTo] = React.useState(today);

  const rangeIsValid = from !== "" && to !== "" && from <= to;

  const query = useQuery({
    queryKey: ["pricing-report", from, to],
    queryFn: () => api.get<PricingReport>(`/api/pricing/report?from=${from}&to=${to}`),
    enabled: rangeIsValid,
  });

  return (
    <div>
      <PageHeader title="Summary report" description="Aggregate totals for documents issued in a date range." />

      <Card className="mb-5">
        <CardHeader title="Date range" />
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="From">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </div>
          {!rangeIsValid ? (
            <p className="mt-2 text-xs text-red-600">The start date must be on or before the end date.</p>
          ) : null}
        </CardBody>
      </Card>

      {query.isError ? (
        <p className="text-sm text-red-600">
          {query.error instanceof ApiError ? query.error.message : "Could not load the report."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Documents" value={query.data ? query.data.documentCount : "—"} />
          <Stat
            label="Sum of grand totals"
            value={query.data ? formatMoney(query.data.grandTotalMinorUnits) : "—"}
          />
          <Stat label="Sum of total tax" value={query.data ? formatMoney(query.data.totalTaxMinorUnits) : "—"} />
          <Stat
            label="Sum of total discount"
            value={query.data ? formatMoney(query.data.totalDiscountMinorUnits) : "—"}
          />
        </div>
      )}
    </div>
  );
};

export default PricingReportPage;
