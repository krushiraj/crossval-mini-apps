"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingRow,
  Select,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api-client";
import { computeLine } from "@/lib/calc/pricing";
import type { DocumentTotals, LineTotals } from "@/lib/calc/pricing";
import { formatIsoDate } from "@/lib/dates";
import { BASIS_POINTS_PER_UNIT } from "@/lib/money";
import {
  basisPointsToPercentInput,
  formatMoney,
  minorUnitsToInput,
  parseAmountToMinorUnits,
  percentInputToBasisPoints,
} from "@/lib/utils";

import type { DiscountType, PricingDocument, PricingLine } from "../_types";

interface LineDraft {
  id?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountType: "" | DiscountType;
  discountValue: string;
  taxPercent: string;
}

interface LinePayload {
  description: string;
  quantity: number;
  unitPriceMinorUnits: number;
  discountType: DiscountType | null;
  discountValue: number;
  taxRateBasisPoints: number;
}

const toDraft = (line: PricingLine): LineDraft => {
  return {
    id: line.id,
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: minorUnitsToInput(line.unitPriceMinorUnits),
    discountType: line.discountType ?? "",
    discountValue:
      line.discountType === "percent"
        ? basisPointsToPercentInput(line.discountValue)
        : line.discountType === "fixed"
          ? minorUnitsToInput(line.discountValue)
          : "",
    taxPercent: basisPointsToPercentInput(line.taxRateBasisPoints),
  };
};

const blankDraft = (): LineDraft => {
  return {
    description: "",
    quantity: "1",
    unitPrice: "0.00",
    discountType: "",
    discountValue: "",
    taxPercent: "0",
  };
};

const draftToPayload = (draft: LineDraft, index: number): { line: LinePayload } | { error: string } => {
  if (!draft.description.trim()) {
    return { error: `Line ${index + 1}: description is required.` };
  }

  const quantity = Number(draft.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: `Line ${index + 1}: quantity must be a whole number of at least 1.` };
  };

  const unitPriceMinorUnits = parseAmountToMinorUnits(draft.unitPrice);
  if (unitPriceMinorUnits === null || unitPriceMinorUnits < 0) {
    return { error: `Line ${index + 1}: unit price is not a valid amount.` };
  };

  const discountType: DiscountType | null = draft.discountType || null;
  let discountValue = 0;
  if (discountType === "percent") {
    const basisPoints = percentInputToBasisPoints(draft.discountValue || "0");
    if (basisPoints === null) return { error: `Line ${index + 1}: discount percent is invalid.` };
    discountValue = basisPoints;
  } else if (discountType === "fixed") {
    const minorUnits = parseAmountToMinorUnits(draft.discountValue || "0");
    if (minorUnits === null) return { error: `Line ${index + 1}: discount amount is invalid.` };
    discountValue = minorUnits;
  }

  const taxRateBasisPoints = percentInputToBasisPoints(draft.taxPercent || "0");
  if (taxRateBasisPoints === null) {
    return { error: `Line ${index + 1}: tax percent is invalid.` };
  };

  return {
    line: {
      description: draft.description.trim(),
      quantity,
      unitPriceMinorUnits,
      discountType,
      discountValue,
      taxRateBasisPoints,
    },
  };
};

// Shows the numbers as you type, using the same calc module the API uses, so
// it can't disagree with what saving will store. The server still works every
// amount out again on save — that's what's kept. A row that isn't finished
// previews as "—" rather than a half-right number.
const previewLine = (draft: LineDraft, index: number): LineTotals | null => {
  const payload = draftToPayload(draft, index);
  if ("error" in payload) return null;
  try {
    return computeLine(payload.line, index);
  } catch {
    return null;
  }
};

// Only meaningful once every row is valid.
const previewDocument = (drafts: LineDraft[]): DocumentTotals | null => {
  const previews = drafts.map((draft, index) => previewLine(draft, index));
  if (previews.some((preview) => preview === null)) return null;
  return (previews as LineTotals[]).reduce<DocumentTotals>(
    (totals, line) => ({
      subtotalMinorUnits: totals.subtotalMinorUnits + line.subtotalMinorUnits,
      totalDiscountMinorUnits: totals.totalDiscountMinorUnits + line.discountMinorUnits,
      totalTaxMinorUnits: totals.totalTaxMinorUnits + line.taxMinorUnits,
      grandTotalMinorUnits: totals.grandTotalMinorUnits + line.totalMinorUnits,
    }),
    { subtotalMinorUnits: 0, totalDiscountMinorUnits: 0, totalTaxMinorUnits: 0, grandTotalMinorUnits: 0 },
  );
};

// Flags real problems while typing — tax over 100%, discount over 100%, a
// fixed discount bigger than the line. Doesn't flag empty fields: a row
// someone has only started isn't wrong yet, just unfinished.
const liveRowError = (draft: LineDraft): string | null => {
  const taxBasisPoints = percentInputToBasisPoints(draft.taxPercent || "0");
  if (taxBasisPoints === null) return "Tax percent is not a valid number.";
  if (taxBasisPoints > BASIS_POINTS_PER_UNIT) return "Tax percent must be between 0 and 100.";

  if (draft.discountType === "percent") {
    const discountBasisPoints = percentInputToBasisPoints(draft.discountValue || "0");
    if (discountBasisPoints === null) return "Discount percent is not a valid number.";
    if (discountBasisPoints > BASIS_POINTS_PER_UNIT) {
      return "Discount percent must be between 0 and 100.";
    }
  }

  if (draft.discountType === "fixed") {
    const discount = parseAmountToMinorUnits(draft.discountValue || "0");
    const unitPrice = parseAmountToMinorUnits(draft.unitPrice);
    const quantity = Number(draft.quantity);
    if (discount === null) return "Discount amount is not a valid amount.";
    if (unitPrice !== null && Number.isInteger(quantity) && quantity >= 1) {
      const subtotal = unitPrice * quantity;
      if (discount > subtotal) {
        return `Fixed discount is more than the line subtotal of ${formatMoney(subtotal)}.`;
      }
    }
  }

  return null;
};

// Pulls `lines.<index>.<field>` errors out of the field map so each row can show its own message.
const parseLineFieldErrors = (fieldErrors: Record<string, string>): Record<number, Record<string, string>> => {
  const result: Record<number, Record<string, string>> = {};
  for (const [path, message] of Object.entries(fieldErrors)) {
    const match = /^lines\.(\d+)\.(\w+)$/.exec(path);
    if (!match) continue;
    const index = Number(match[1]);
    result[index] = { ...(result[index] ?? {}), [match[2]]: message };
  }
  return result;
};

export const DocumentEditor = ({ documentId }: { documentId: string }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["pricing-document", documentId];

  const query = useQuery({
    queryKey,
    queryFn: () => api.get<PricingDocument>(`/api/pricing/documents/${documentId}`),
  });

  const [title, setTitle] = React.useState("");
  const [customer, setCustomer] = React.useState("");
  const [issueDate, setIssueDate] = React.useState("");
  const [metadataErrors, setMetadataErrors] = React.useState<Record<string, string>>({});

  const [lines, setLines] = React.useState<LineDraft[]>([]);
  const [lineErrors, setLineErrors] = React.useState<Record<number, Record<string, string>>>({});

  // Loads server data into the form once per document, adjusting state
  // during render instead of using an effect (React's pattern for this,
  // avoids an extra render). After that, saving re-syncs state itself, so a
  // background refetch never overwrites edits the user hasn't saved yet.
  const [hydratedId, setHydratedId] = React.useState<string | null>(null);
  if (query.data && query.data.id !== hydratedId) {
    setHydratedId(query.data.id);
    setTitle(query.data.title);
    setCustomer(query.data.customer);
    setIssueDate(query.data.issueDate);
    setLines(query.data.lines.length > 0 ? query.data.lines.map(toDraft) : [blankDraft()]);
  }

  const invalidateSiblingQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["pricing-documents"] });
    queryClient.invalidateQueries({ queryKey: ["pricing-report"] });
  };

  const metadataMutation = useMutation({
    mutationFn: () =>
      api.patch<PricingDocument>(`/api/pricing/documents/${documentId}`, {
        title,
        customer,
        issueDate,
      }),
    onSuccess: (document) => {
      queryClient.setQueryData(queryKey, document);
      invalidateSiblingQueries();
      toast.success("Document details saved.");
      setMetadataErrors({});
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors) {
        setMetadataErrors(error.fieldErrors);
      } else {
        toast.error(error instanceof ApiError ? error.message : "Could not save document details.");
      }
    },
  });

  const linesMutation = useMutation({
    mutationFn: (payload: LinePayload[]) =>
      api.put<PricingDocument>(`/api/pricing/documents/${documentId}/lines`, { lines: payload }),
    onSuccess: (document) => {
      queryClient.setQueryData(queryKey, document);
      invalidateSiblingQueries();
      setLines(document.lines.length > 0 ? document.lines.map(toDraft) : [blankDraft()]);
      setLineErrors({});
      toast.success("Line items saved.");
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.fieldErrors) {
          setLineErrors(parseLineFieldErrors(error.fieldErrors));
        } else if (typeof error.details?.lineIndex === "number") {
          // These errors come from the calc module keyed by line index, not
          // by form field, so map them onto the row here too.
          const field = typeof error.details.field === "string" ? error.details.field : "description";
          setLineErrors({ [error.details.lineIndex]: { [field]: error.message } });
        }
      }
      toast.error(error instanceof ApiError ? error.message : "Could not save line items.");
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.post<PricingDocument>(`/api/pricing/documents/${documentId}/finalize`),
    onSuccess: (document) => {
      queryClient.setQueryData(queryKey, document);
      invalidateSiblingQueries();
      toast.success("Document finalized. It is now read-only.");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not finalize the document.");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.post<PricingDocument>(`/api/pricing/documents/${documentId}/duplicate`),
    onSuccess: (document) => {
      invalidateSiblingQueries();
      toast.success("Duplicated into a new draft.");
      router.push(`/pricing/${document.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not duplicate the document.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/pricing/documents/${documentId}`),
    onSuccess: () => {
      invalidateSiblingQueries();
      toast.success("Document deleted.");
      router.push("/pricing");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not delete the document.");
    },
  });

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  };

  const addLine = () => {
    setLines((current) => [...current, blankDraft()]);
  };

  const removeLine = (index: number) => {
    setLines((current) => (current.length <= 1 ? [blankDraft()] : current.filter((_, i) => i !== index)));
  };

  // Returns null (after saying why) when a row can't be turned into a payload,
  // so callers know to stop rather than save half of it.
  const buildLinePayloads = (): LinePayload[] | null => {
    const payloads: LinePayload[] = [];
    for (const [index, draft] of lines.entries()) {
      // A lone blank row (the default empty state) saves as no lines,
      // instead of failing on the empty description.
      if (lines.length === 1 && !draft.description.trim() && draft.unitPrice === "0.00") continue;
      const rangeProblem = liveRowError(draft);
      if (rangeProblem) {
        toast.error(`Line ${index + 1}: ${rangeProblem}`);
        return null;
      }
      const result = draftToPayload(draft, index);
      if ("error" in result) {
        toast.error(result.error);
        return null;
      }
      payloads.push(result.line);
    }
    return payloads;
  };

  const hasUnsavedChanges = (): boolean => {
    if (!query.data) return false;
    const saved = query.data.lines.length > 0 ? query.data.lines.map(toDraft) : [blankDraft()];
    const metadataChanged =
      title !== query.data.title ||
      customer !== query.data.customer ||
      issueDate !== query.data.issueDate;
    return metadataChanged || JSON.stringify(lines) !== JSON.stringify(saved);
  };

  const handleSaveLines = () => {
    const payloads = buildLinePayloads();
    if (!payloads) return;
    setLineErrors({});
    linesMutation.mutate(payloads);
  };

  // Finalizing freezes the document, so anything still in the form would be
  // lost. Save it first, and if that fails don't finalize at all.
  const handleFinalize = async () => {
    const unsaved = hasUnsavedChanges();
    const payloads = unsaved ? buildLinePayloads() : [];
    if (payloads === null) return;

    const message = unsaved
      ? "Finalize this document? Your unsaved changes will be saved first, and it then becomes read-only."
      : "Finalize this document? It becomes read-only and can no longer be edited.";
    if (!window.confirm(message)) return;

    try {
      if (unsaved) {
        setLineErrors({});
        await metadataMutation.mutateAsync();
        await linesMutation.mutateAsync(payloads);
      }
      await finalizeMutation.mutateAsync();
    } catch {
      // Each mutation reports its own failure. Stopping here leaves the
      // document a draft with the edits still in the form.
    }
  };

  const handleDelete = () => {
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    deleteMutation.mutate();
  };

  if (query.isLoading) {
    return <LoadingRow label="Loading document…" />;
  }

  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="Document not found"
        description={query.error instanceof ApiError ? query.error.message : "It may have been deleted."}
        action={<Button onClick={() => router.push("/pricing")}>Back to documents</Button>}
      />
    );
  }

  const document = query.data;
  const isDraft = document.status === "draft";

  const draftTotals = isDraft ? previewDocument(lines) : null;
  const shownTotals: DocumentTotals = draftTotals ?? {
    subtotalMinorUnits: document.subtotalMinorUnits,
    totalDiscountMinorUnits: document.totalDiscountMinorUnits,
    totalTaxMinorUnits: document.totalTaxMinorUnits,
    grandTotalMinorUnits: document.grandTotalMinorUnits,
  };

  return (
    <div className="print-sheet">
      <PageHeader
        title={document.title}
        description={`${document.customer} · Issued ${formatIsoDate(document.issueDate)}`}
        action={
          <div className="no-print flex items-center gap-2">
            <Badge tone={isDraft ? "warning" : "success"}>{document.status}</Badge>
            {isDraft ? (
              <>
                <Button variant="secondary" onClick={handleDelete} loading={deleteMutation.isPending}>
                  Delete
                </Button>
                <Button onClick={handleFinalize} loading={finalizeMutation.isPending}>
                  Finalize
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => window.print()}>
                  Print
                </Button>
                <Button onClick={() => duplicateMutation.mutate()} loading={duplicateMutation.isPending}>
                  Duplicate to new draft
                </Button>
              </>
            )}
          </div>
        }
      />

      {document.duplicatedFromId ? (
        <p className="no-print mb-4 text-xs text-slate-500">Duplicated from a previous document.</p>
      ) : null}

      <Card className="mb-5">
        <CardHeader title="Details" />
        <CardBody>
          {isDraft ? (
            <form
              className="grid gap-4 sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                metadataMutation.mutate();
              }}
            >
              <Field label="Title" error={metadataErrors.title}>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
              </Field>
              <Field label="Customer" error={metadataErrors.customer}>
                <Input value={customer} onChange={(event) => setCustomer(event.target.value)} required />
              </Field>
              <Field label="Issue date" error={metadataErrors.issueDate}>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(event) => setIssueDate(event.target.value)}
                  required
                />
              </Field>
              <div className="no-print sm:col-span-3">
                <Button type="submit" variant="secondary" loading={metadataMutation.isPending}>
                  Save details
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-slate-500">Title</dt>
                <dd className="text-sm text-slate-900">{document.title}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Customer</dt>
                <dd className="text-sm text-slate-900">{document.customer}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Issue date</dt>
                <dd className="text-sm text-slate-900">{formatIsoDate(document.issueDate)}</dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>

      {/* A real form, so Enter in any line field saves. "Add line" and
          "Remove" are type="button" by default and never submit it. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSaveLines();
        }}
      >
      <Card className="mb-5">
        <CardHeader
          title="Line items"
          action={
            isDraft ? (
              <div className="no-print flex gap-2">
                <Button variant="secondary" size="sm" onClick={addLine}>
                  Add line
                </Button>
                <Button type="submit" size="sm" loading={linesMutation.isPending}>
                  Save changes
                </Button>
              </div>
            ) : null
          }
        />
          <CardBody className="px-0 py-0">
            <Table className="min-w-[64rem]">
              <thead>
                <tr>
                  <Th>Description</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th>Discount</Th>
                  <Th className="text-right">Tax %</Th>
                  <Th className="text-right">Subtotal</Th>
                  <Th className="text-right">Discount</Th>
                  <Th className="text-right">Tax</Th>
                  <Th className="text-right">Total</Th>
                  {isDraft ? <Th className="no-print"></Th> : null}
                </tr>
              </thead>
              <tbody>
                {isDraft
                  ? lines.map((line, index) => {
                      const errors = lineErrors[index] ?? {};
                      const preview = previewLine(line, index);
                      const rowMessages = [liveRowError(line), ...Object.values(errors)].filter(
                        (message): message is string => Boolean(message),
                      );
                      const hasError = rowMessages.length > 0;
                      return (
                        <React.Fragment key={line.id ?? `new-${index}`}>
                        <tr className={hasError ? "bg-red-200 align-middle" : "align-middle"}>
                          <Td>
                            <Input
                              className="min-w-[12rem]"
                              value={line.description}
                              onChange={(event) => updateLine(index, { description: event.target.value })}
                              placeholder="Item or service"
                            />
                          </Td>
                          <Td className="text-right">
                            <Input
                              className="text-right"
                              value={line.quantity}
                              onChange={(event) => updateLine(index, { quantity: event.target.value })}
                              inputMode="numeric"
                            />
                          </Td>
                          <Td className="text-right">
                            <Input
                              className="text-right"
                              value={line.unitPrice}
                              onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                              inputMode="decimal"
                            />
                          </Td>
                          <Td>
                            <div className="flex gap-1">
                              <Select
                                className="w-20 shrink-0"
                                value={line.discountType}
                                onChange={(event) =>
                                  updateLine(index, {
                                    discountType: event.target.value as "" | DiscountType,
                                    discountValue: "",
                                  })
                                }
                              >
                                <option value="">None</option>
                                <option value="percent">%</option>
                                <option value="fixed">$</option>
                              </Select>
                              {line.discountType ? (
                                <Input
                                  className="w-24 text-right"
                                  value={line.discountValue}
                                  onChange={(event) =>
                                    updateLine(index, { discountValue: event.target.value })
                                  }
                                  placeholder={line.discountType === "percent" ? "10" : "20.00"}
                                />
                              ) : null}
                            </div>
                          </Td>
                          <Td className="text-right">
                            <Input
                              className="text-right"
                              value={line.taxPercent}
                              onChange={(event) => updateLine(index, { taxPercent: event.target.value })}
                              inputMode="decimal"
                            />
                          </Td>
                          <Td className="text-right tabular-nums text-slate-400">
                            {preview ? formatMoney(preview.subtotalMinorUnits) : "—"}
                          </Td>
                          <Td className="text-right tabular-nums text-slate-400">
                            {preview ? formatMoney(preview.discountMinorUnits) : "—"}
                          </Td>
                          <Td className="text-right tabular-nums text-slate-400">
                            {preview ? formatMoney(preview.taxMinorUnits) : "—"}
                          </Td>
                          <Td className="text-right tabular-nums text-slate-400">
                            {preview ? formatMoney(preview.totalMinorUnits) : "—"}
                          </Td>
                          <Td className="no-print">
                            <Button variant="ghost" size="sm" onClick={() => removeLine(index)}>
                              Remove
                            </Button>
                          </Td>
                        </tr>
                        {rowMessages.length > 0 ? (
                          <tr>
                            <td
                              colSpan={10}
                              className="border-b border-slate-100 px-3 pb-2 text-[11px] font-medium text-red-700"
                            >
                              <span role="alert">{rowMessages.join(" ")}</span>
                            </td>
                          </tr>
                        ) : null}
                        </React.Fragment>
                      );
                    })
                  : document.lines.map((line) => (
                      <tr key={line.id}>
                        <Td>{line.description}</Td>
                        <Td className="text-right tabular-nums">{line.quantity}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(line.unitPriceMinorUnits)}</Td>
                        <Td>
                          {line.discountType === "percent"
                            ? `${basisPointsToPercentInput(line.discountValue)}%`
                            : line.discountType === "fixed"
                              ? formatMoney(line.discountValue)
                              : "—"}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {basisPointsToPercentInput(line.taxRateBasisPoints)}%
                        </Td>
                        <Td className="text-right tabular-nums">{formatMoney(line.subtotalMinorUnits)}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(line.discountMinorUnits)}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(line.taxMinorUnits)}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(line.totalMinorUnits)}</Td>
                      </tr>
                    ))}
              </tbody>
            </Table>
          {!isDraft && document.lines.length === 0 ? <EmptyState title="No line items" /> : null}
        </CardBody>
      </Card>
      </form>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Subtotal" value={formatMoney(shownTotals.subtotalMinorUnits)} />
        <Stat
          label="Total discount"
          value={formatMoney(shownTotals.totalDiscountMinorUnits)}
          tone="negative"
        />
        <Stat label="Total tax" value={formatMoney(shownTotals.totalTaxMinorUnits)} />
        <Stat label="Grand total" value={formatMoney(shownTotals.grandTotalMinorUnits)} tone="positive" />
      </div>
      {isDraft ? (
        <p className="no-print mt-2 text-xs text-slate-500" role="status">
          {draftTotals
            ? "Showing your unsaved edits. Save to store them — the server works them out again."
            : "Some rows aren't finished, so these are the totals from the last save."}
        </p>
      ) : null}
    </div>
  );
};
