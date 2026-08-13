"use client";

import { Badge } from "@/components/ui";

import type { OrderStatus } from "./types";

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
};

const STATUS_TONE: Record<OrderStatus, "neutral" | "info" | "success" | "danger"> = {
  pending: "neutral",
  partially_paid: "info",
  paid: "success",
  overdue: "danger",
};

export const StatusBadge = ({ status }: { status: OrderStatus }) => {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
};
