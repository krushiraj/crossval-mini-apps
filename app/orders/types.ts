// DTO shapes returned by /api/orders — mirrors app/api/orders/_lib.ts's serializers.

export type OrderStatus = "pending" | "partially_paid" | "paid" | "overdue";

export interface OrderLineItemDto {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinorUnits: number;
  lineTotalMinorUnits: number;
}

export interface PaymentDto {
  id: string;
  amountMinorUnits: number;
  paidDate: string;
  note: string | null;
  createdAt: string;
}

export interface AuditEntryDto {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface OrderListItemDto {
  id: string;
  customer: string;
  dueDate: string;
  totalMinorUnits: number;
  paidMinorUnits: number;
  dueMinorUnits: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailDto extends OrderListItemDto {
  lines: OrderLineItemDto[];
  payments: PaymentDto[];
  auditHistory: AuditEntryDto[];
}

export interface PaymentResponseDto {
  payment: PaymentDto;
  summary: {
    paidMinorUnits: number;
    dueMinorUnits: number;
    status: OrderStatus;
  };
}
