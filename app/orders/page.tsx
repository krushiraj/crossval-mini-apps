"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import * as React from "react";

import { PageHeader } from "@/components/app-shell";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  LoadingRow,
  Select,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/utils";

import { fetchOrders } from "./api";
import { StatusBadge } from "./status-badge";
import type { OrderStatus } from "./types";

const STATUS_OPTIONS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

const OrdersDashboardPage = () => {
  const [statusFilter, setStatusFilter] = React.useState<OrderStatus | "all">("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
  });

  const orders = data?.orders ?? [];
  const visibleOrders = statusFilter === "all" ? orders : orders.filter((order) => order.status === statusFilter);

  // These stats count every order, not just the ones the status filter is showing.
  const totalOutstandingMinorUnits = orders
    .filter((order) => order.status !== "paid")
    .reduce((sum, order) => sum + order.dueMinorUnits, 0);
  const overdueCount = orders.filter((order) => order.status === "overdue").length;

  return (
    <div>
      <PageHeader
        title="Orders & Settlements"
        description="Track order totals, payments received, and what's still outstanding."
        action={
          <Link href="/orders/new">
            <Button>New order</Button>
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Orders" value={orders.length} />
        <Stat
          label="Total outstanding"
          value={formatMoney(totalOutstandingMinorUnits)}
          tone={totalOutstandingMinorUnits > 0 ? "negative" : "default"}
        />
        <Stat label="Overdue orders" value={overdueCount} tone={overdueCount > 0 ? "negative" : "default"} />
      </div>

      <Card>
        <CardHeader
          title="Orders"
          action={
            <Field label="Filter by status" className="w-48">
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "all")}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          }
        />
        <CardBody className="p-0">
          {isLoading ? (
            <LoadingRow label="Loading orders…" />
          ) : isError ? (
            <EmptyState title="Could not load orders" description="Please refresh the page to try again." />
          ) : visibleOrders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="Create your first order to start tracking payments."
              action={
                <Link href="/orders/new">
                  <Button size="sm">New order</Button>
                </Link>
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th>Order total</Th>
                  <Th>Amount paid</Th>
                  <Th>Amount due</Th>
                  <Th>Due date</Th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <Td>
                      <Link href={`/orders/${order.id}`} className="font-medium text-slate-900 hover:underline">
                        {order.customer}
                      </Link>
                    </Td>
                    <Td>
                      <StatusBadge status={order.status} />
                    </Td>
                    <Td className="tabular-nums">{formatMoney(order.totalMinorUnits)}</Td>
                    <Td className="tabular-nums">{formatMoney(order.paidMinorUnits)}</Td>
                    <Td className="tabular-nums">{formatMoney(order.dueMinorUnits)}</Td>
                    <Td>{formatIsoDate(order.dueDate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default OrdersDashboardPage;
