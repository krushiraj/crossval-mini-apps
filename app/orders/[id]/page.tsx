"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingRow,
  Stat,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { computeOrderTotal } from "@/lib/calc/orders";
import { formatIsoDate, todayIsoDate } from "@/lib/dates";
import { formatMoney, parseAmountToMinorUnits } from "@/lib/utils";

import { deleteOrder, fetchOrder, recordPayment, replaceOrderLines, updateOrder } from "../api";
import { StatusBadge } from "../status-badge";
import type { OrderLineItemDto } from "../types";

const actionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    "order.created": "Order created",
    "order.updated": "Order details updated",
    "order.lines_replaced": "Line items updated",
    "order.deleted": "Order deleted",
    "payment.recorded": "Payment recorded",
    "payment.rejected": "Payment rejected",
  };
  return labels[action] ?? action;
};

// Number("1e3") is 1000; a quantity box should only take digits.
const parseQuantity = (value: string): number | null =>
  /^\d+$/.test(value.trim()) ? Number(value) : null;

interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}


// Shows the total as you type, using the same computeOrderTotal the API uses.
// The server still works it out again on save. Any line that isn't a valid
// amount makes the whole preview "—" rather than a misleading part-total.
const previewOrderTotal = (drafts: DraftLine[]): number | null => {
  const unitPrices = drafts.map((line) => parseAmountToMinorUnits(line.unitPrice));
  if (unitPrices.some((price) => price === null)) return null;
  try {
    const { totalMinorUnits } = computeOrderTotal(
      drafts.map((line, index) => ({
        quantity: parseQuantity(line.quantity) as number,
        unitPriceMinorUnits: unitPrices[index] as number,
      })),
    );
    return totalMinorUnits;
  } catch {
    return null;
  }
};

const OrderDetailPage = () => {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder(orderId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  // --- Customer / due date editing (always allowed) -----------------------
  const [editingDetails, setEditingDetails] = React.useState(false);
  const [customerDraft, setCustomerDraft] = React.useState("");
  const [dueDateDraft, setDueDateDraft] = React.useState("");
  const [detailErrors, setDetailErrors] = React.useState<Record<string, string>>({});

  const startEditingDetails = (customer: string, dueDate: string) => {
    setCustomerDraft(customer);
    setDueDateDraft(dueDate);
    setDetailErrors({});
    setEditingDetails(true);
  };

  const updateDetailsMutation = useMutation({
    mutationFn: () => updateOrder(orderId, { customer: customerDraft, dueDate: dueDateDraft }),
    onSuccess: () => {
      toast.success("Order details updated.");
      setEditingDetails(false);
      invalidate();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors) {
        setDetailErrors(error.fieldErrors);
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "Could not update the order.");
    },
  });

  // --- Line item editing (blocked once a payment exists) ------------------
  const [editingLines, setEditingLines] = React.useState(false);
  const [lineDrafts, setLineDrafts] = React.useState<DraftLine[]>([]);
  const [lineErrors, setLineErrors] = React.useState<Record<string, string>>({});

  const startEditingLines = (lines: OrderLineItemDto[]) => {
    setLineDrafts(
      lines.map((line) => ({
        key: line.id,
        description: line.description,
        quantity: String(line.quantity),
        unitPrice: (line.unitPriceMinorUnits / 100).toFixed(2),
      })),
    );
    setLineErrors({});
    setEditingLines(true);
  };

  const replaceLinesMutation = useMutation({
    mutationFn: () =>
      replaceOrderLines(
        orderId,
        lineDrafts.map((line) => ({
          description: line.description,
          quantity: parseQuantity(line.quantity) as number,
          unitPriceMinorUnits: parseAmountToMinorUnits(line.unitPrice) as number,
        })),
      ),
    onSuccess: () => {
      toast.success("Line items updated.");
      setEditingLines(false);
      invalidate();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors) {
        setLineErrors(error.fieldErrors);
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "Could not update line items.");
    },
  });

  // --- Payments -------------------------------------------------------------
  const [amountInput, setAmountInput] = React.useState("");
  const [paidDate, setPaidDate] = React.useState(todayIsoDate());
  const [note, setNote] = React.useState("");
  const [paymentErrors, setPaymentErrors] = React.useState<Record<string, string>>({});

  const recordPaymentMutation = useMutation({
    mutationFn: () =>
      recordPayment(orderId, {
        amountMinorUnits: parseAmountToMinorUnits(amountInput) as number,
        paidDate,
        note: note.trim() ? note.trim() : undefined,
      }),
    onSuccess: (result) => {
      toast.success(`Payment of ${formatMoney(result.payment.amountMinorUnits)} recorded.`);
      setAmountInput("");
      setNote("");
      setPaidDate(todayIsoDate());
      setPaymentErrors({});
      invalidate();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors) {
        setPaymentErrors(error.fieldErrors);
        return;
      }
      // Over-payment (or any other non-field) rejection shows its own
      // actionable message, e.g. "...maximum you can record is $600.00."
      toast.error(error instanceof ApiError ? error.message : "Could not record the payment.");
    },
  });

  const handleRecordPayment = (event: React.FormEvent) => {
    event.preventDefault();
    setPaymentErrors({});

    if (parseAmountToMinorUnits(amountInput) === null) {
      setPaymentErrors({
        amountMinorUnits: "Enter an amount like 25 or 25.00, with at most two decimal places.",
      });
      return;
    }

    recordPaymentMutation.mutate();
  };

  // --- Delete -----------------------------------------------------------
  const deleteMutation = useMutation({
    mutationFn: () => deleteOrder(orderId),
    onSuccess: () => {
      toast.success("Order deleted.");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      router.push("/orders");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not delete the order.");
    },
  });

  if (isLoading) {
    return <LoadingRow label="Loading order…" />;
  }

  if (isError || !order) {
    return (
      <EmptyState
        title="Order not found"
        description="It may have been deleted, or it belongs to a different account."
      />
    );
  }

  const hasPayments = order.payments.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.customer}
        description={`Due ${formatIsoDate(order.dueDate)}`}
        action={<StatusBadge status={order.status} />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Order total" value={formatMoney(order.totalMinorUnits)} />
        <Stat label="Amount paid" value={formatMoney(order.paidMinorUnits)} tone="positive" />
        <Stat
          label="Amount due"
          value={formatMoney(order.dueMinorUnits)}
          tone={order.dueMinorUnits > 0 ? "negative" : "default"}
        />
      </div>

      <Card>
        <CardHeader
          title="Order details"
          action={
            editingDetails ? null : (
              <Button size="sm" variant="secondary" onClick={() => startEditingDetails(order.customer, order.dueDate)}>
                Edit
              </Button>
            )
          }
        />
        <CardBody>
          {editingDetails ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setDetailErrors({});
                updateDetailsMutation.mutate();
              }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <Field label="Customer" error={detailErrors.customer}>
                <Input value={customerDraft} onChange={(event) => setCustomerDraft(event.target.value)} required />
              </Field>
              <Field label="Due date" error={detailErrors.dueDate}>
                <Input
                  type="date"
                  value={dueDateDraft}
                  onChange={(event) => setDueDateDraft(event.target.value)}
                  required
                />
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" size="sm" loading={updateDetailsMutation.isPending}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingDetails(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">Customer</dt>
                <dd className="mt-0.5 text-slate-900">{order.customer}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Due date</dt>
                <dd className="mt-0.5 text-slate-900">{formatIsoDate(order.dueDate)}</dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Line items"
          description={
            hasPayments
              ? "Read-only: this order has payments recorded, so its lines and total are frozen."
              : undefined
          }
          action={
            hasPayments || editingLines ? null : (
              <Button size="sm" variant="secondary" onClick={() => startEditingLines(order.lines)}>
                Edit line items
              </Button>
            )
          }
        />
        <CardBody className={editingLines ? undefined : "p-0"}>
          {editingLines ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setLineErrors({});

                // A price we can't read used to be sent as 0, wiping the total.
                const problems: Record<string, string> = {};
                lineDrafts.forEach((line, index) => {
                  if (parseAmountToMinorUnits(line.unitPrice) === null) {
                    problems[`lines.${index}.unitPriceMinorUnits`] =
                      "Enter an amount like 25 or 25.00, with at most two decimal places.";
                  }
                  if (parseQuantity(line.quantity) === null) {
                    problems[`lines.${index}.quantity`] = "Enter a whole number, like 1.";
                  }
                });
                if (Object.keys(problems).length > 0) {
                  setLineErrors(problems);
                  toast.error("Check the highlighted amounts.");
                  return;
                }

                replaceLinesMutation.mutate();
              }}
              className="space-y-3"
            >
              {lineErrors.lines ? <p className="text-xs text-red-600">{lineErrors.lines}</p> : null}
              {lineDrafts.map((line, index) => (
                <div
                  key={line.key}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px_140px_auto] sm:items-start"
                >
                  <Field
                    label={index === 0 ? "Description" : undefined}
                    error={lineErrors[`lines.${index}.description`]}
                  >
                    <Input
                      aria-label={index === 0 ? undefined : `Line ${index + 1} description`}
                      value={line.description}
                      onChange={(event) =>
                        setLineDrafts((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, description: event.target.value } : row,
                          ),
                        )
                      }
                      required
                    />
                  </Field>
                  <Field
                    label={index === 0 ? "Quantity" : undefined}
                    error={lineErrors[`lines.${index}.quantity`]}
                  >
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      aria-label={index === 0 ? undefined : `Line ${index + 1} quantity`}
                      value={line.quantity}
                      onChange={(event) =>
                        setLineDrafts((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, quantity: event.target.value } : row,
                          ),
                        )
                      }
                      required
                    />
                  </Field>
                  <Field
                    label={index === 0 ? "Unit price" : undefined}
                    error={lineErrors[`lines.${index}.unitPriceMinorUnits`]}
                  >
                    <Input
                      aria-label={index === 0 ? undefined : `Line ${index + 1} unit price`}
                      value={line.unitPrice}
                      onChange={(event) =>
                        setLineDrafts((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, unitPrice: event.target.value } : row,
                          ),
                        )
                      }
                      inputMode="decimal"
                      required
                    />
                  </Field>
                  <div className={index === 0 ? "pt-5" : ""}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={lineDrafts.length === 1}
                      onClick={() =>
                        setLineDrafts((current) =>
                          current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : current,
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setLineDrafts((current) => [
                      ...current,
                      { key: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "" },
                    ])
                  }
                >
                  Add line
                </Button>
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-slate-900">
                  Estimated total:{" "}
                  {previewOrderTotal(lineDrafts) === null
                    ? "—"
                    : formatMoney(previewOrderTotal(lineDrafts) as number)}
                </span>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={replaceLinesMutation.isPending}>
                    Save line items
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditingLines(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <Table className="min-w-[36rem]">
              <thead>
                <tr>
                  <Th>Description</Th>
                  <Th>Quantity</Th>
                  <Th>Unit price</Th>
                  <Th>Line total</Th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.id}>
                    <Td>{line.description}</Td>
                    <Td className="tabular-nums">{line.quantity}</Td>
                    <Td className="tabular-nums">{formatMoney(line.unitPriceMinorUnits)}</Td>
                    <Td className="tabular-nums">{formatMoney(line.lineTotalMinorUnits)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Record a payment" description="Total payments can never exceed the order total." />
        <CardBody>
          <form onSubmit={handleRecordPayment} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-start">
            <Field label="Amount" error={paymentErrors.amountMinorUnits ?? paymentErrors.amount}>
              <Input
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                required
              />
            </Field>
            <Field label="Date" error={paymentErrors.paidDate}>
              <Input type="date" value={paidDate} onChange={(event) => setPaidDate(event.target.value)} required />
            </Field>
            <Field label="Note (optional)" error={paymentErrors.note} className="sm:col-span-2">
              <Textarea rows={1} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <div className="sm:col-span-4">
              <Button type="submit" loading={recordPaymentMutation.isPending} disabled={order.dueMinorUnits === 0}>
                Record payment
              </Button>
              {order.dueMinorUnits === 0 ? (
                <span className="ml-3 text-xs text-slate-500">This order is fully paid.</span>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Payment history" />
        <CardBody className="p-0">
          {order.payments.length === 0 ? (
            <EmptyState title="No payments recorded yet" />
          ) : (
            <Table className="min-w-[36rem]">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Amount</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {order.payments.map((payment) => (
                  <tr key={payment.id}>
                    <Td>{formatIsoDate(payment.paidDate)}</Td>
                    <Td className="tabular-nums">{formatMoney(payment.amountMinorUnits)}</Td>
                    <Td className="text-slate-500">{payment.note || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Audit history" description="Every change and payment attempt on this order." />
        <CardBody className="p-0">
          {order.auditHistory.length === 0 ? (
            <EmptyState title="No activity recorded yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {order.auditHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                >
                  <span className="text-slate-900">{actionLabel(entry.action)}</span>
                  <span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {!hasPayments ? (
        <div className="flex justify-end">
          <Button
            variant="danger"
            size="sm"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm("Delete this order? This cannot be undone.")) {
                deleteMutation.mutate();
              }
            }}
          >
            Delete order
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default OrderDetailPage;
