"use client";

import { api, newIdempotencyKey } from "@/lib/api-client";

import type { OrderDetailDto, OrderListItemDto, PaymentResponseDto } from "./types";

export const fetchOrders = (): Promise<{ orders: OrderListItemDto[] }> => {
  return api.get<{ orders: OrderListItemDto[] }>("/api/orders");
};

export const fetchOrder = (id: string): Promise<OrderDetailDto> => {
  return api.get<OrderDetailDto>(`/api/orders/${id}`);
};

export interface OrderLineInput {
  description: string;
  quantity: number;
  unitPriceMinorUnits: number;
}

export interface CreateOrderInput {
  customer: string;
  dueDate: string;
  lines: OrderLineInput[];
}

export const createOrder = (input: CreateOrderInput): Promise<OrderListItemDto> => {
  return api.post<OrderListItemDto>("/api/orders", input);
};

export interface UpdateOrderInput {
  customer?: string;
  dueDate?: string;
}

export const updateOrder = (id: string, input: UpdateOrderInput): Promise<OrderDetailDto> => {
  return api.patch<OrderDetailDto>(`/api/orders/${id}`, input);
};

export const replaceOrderLines = (id: string, lines: OrderLineInput[]): Promise<OrderDetailDto> => {
  return api.put<OrderDetailDto>(`/api/orders/${id}/lines`, { lines });
};

export const deleteOrder = (id: string): Promise<void> => {
  return api.delete<void>(`/api/orders/${id}`);
};

export interface RecordPaymentInput {
  amountMinorUnits: number;
  paidDate: string;
  note?: string;
}

// Mints a fresh idempotency key each call. If a caller needs to retry the
// same submission, it should reuse that key rather than calling this again.
export const recordPayment = (orderId: string, input: RecordPaymentInput): Promise<PaymentResponseDto> => {
  return api.post<PaymentResponseDto>(`/api/orders/${orderId}/payments`, input, {
    "Idempotency-Key": newIdempotencyKey(),
  });
};
