"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { computeOrderTotal } from "@/lib/calc/orders";
import { todayIsoDate } from "@/lib/dates";
import { formatMoney, parseAmountToMinorUnits } from "@/lib/utils";

import { createOrder } from "../api";

interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const newDraftLine = (): DraftLine => {
  return { key: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "" };
};


// Shows the total as you type, using the same computeOrderTotal the API uses.
// The server still works it out again on save. Any line that isn't a valid
// amount makes the whole preview "—" rather than a misleading part-total.
const previewOrderTotal = (drafts: DraftLine[]): number | null => {
  const unitPrices = drafts.map((line) => parseAmountToMinorUnits(line.unitPrice));
  if (unitPrices.some((price) => price === null)) return null;
  try {
    const { totalMinorUnits } = computeOrderTotal(
      drafts.map((line, index) => ({
        quantity: Number(line.quantity),
        unitPriceMinorUnits: unitPrices[index] as number,
      })),
    );
    return totalMinorUnits;
  } catch {
    return null;
  }
};

const NewOrderPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [customer, setCustomer] = React.useState("");
  const [dueDate, setDueDate] = React.useState(todayIsoDate());
  const [lines, setLines] = React.useState<DraftLine[]>([newDraftLine()]);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (order) => {
      toast.success(`Order for ${order.customer} created.`);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      router.push(`/orders/${order.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
        return;
      }
      const message = error instanceof ApiError ? error.message : "Could not create the order.";
      toast.error(message);
    },
  });

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    setLines((current) => [...current, newDraftLine()]);
  };

  const removeLine = (key: string) => {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  };

  const estimatedTotal = previewOrderTotal(lines);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});

    mutation.mutate({
      customer,
      dueDate,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitPriceMinorUnits: parseAmountToMinorUnits(line.unitPrice) ?? 0,
      })),
    });
  };

  return (
    <div>
      <PageHeader title="New order" description="Add a customer, due date, and the line items being ordered." />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader title="Order details" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer" error={fieldErrors.customer}>
              <Input
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
                placeholder="Acme Corp"
                required
              />
            </Field>
            <Field label="Due date" error={fieldErrors.dueDate}>
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Line items"
            action={
              <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                Add line
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {fieldErrors.lines ? <p className="text-xs text-red-600">{fieldErrors.lines}</p> : null}
            {lines.map((line, index) => (
              <div key={line.key} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px_140px_auto] sm:items-start">
                <Field
                  label={index === 0 ? "Description" : undefined}
                  error={fieldErrors[`lines.${index}.description`]}
                >
                  <Input
                    aria-label={index === 0 ? undefined : `Line ${index + 1} description`}
                    value={line.description}
                    onChange={(event) => updateLine(line.key, { description: event.target.value })}
                    placeholder="Item description"
                    required
                  />
                </Field>
                <Field label={index === 0 ? "Quantity" : undefined} error={fieldErrors[`lines.${index}.quantity`]}>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    aria-label={index === 0 ? undefined : `Line ${index + 1} quantity`}
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    required
                  />
                </Field>
                <Field
                  label={index === 0 ? "Unit price" : undefined}
                  error={fieldErrors[`lines.${index}.unitPriceMinorUnits`]}
                >
                  <Input
                    aria-label={index === 0 ? undefined : `Line ${index + 1} unit price`}
                    value={line.unitPrice}
                    onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                    placeholder="0.00"
                    inputMode="decimal"
                    required
                  />
                </Field>
                <div className={index === 0 ? "pt-5" : ""}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex justify-end border-t border-slate-100 pt-3 text-sm font-medium text-slate-900">
              Estimated total: {estimatedTotal === null ? "—" : formatMoney(estimatedTotal)}
            </div>
          </CardBody>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push("/orders")}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create order
          </Button>
        </div>
      </form>
    </div>
  );
};

export default NewOrderPage;
