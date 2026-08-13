"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge, Button, Card, EmptyState, Field, LoadingRow, Select, Table, Td, Th } from "@/components/ui";
import { ApiError, api } from "@/lib/api-client";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/utils";

import type { DocumentStatus, PricingDocumentSummary } from "./_types";

const STATUS_TONE: Record<DocumentStatus, "warning" | "success"> = {
  draft: "warning",
  finalized: "success",
};

const PricingDocumentsPage = () => {
  const [statusFilter, setStatusFilter] = React.useState<"" | DocumentStatus>("");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pricing-documents", statusFilter],
    queryFn: () =>
      api.get<{ documents: PricingDocumentSummary[] }>(
        `/api/pricing/documents${statusFilter ? `?status=${statusFilter}` : ""}`,
      ),
  });

  const handleDelete = async (document: PricingDocumentSummary) => {
    if (!window.confirm(`Delete "${document.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/pricing/documents/${document.id}`);
      toast.success("Document deleted.");
      queryClient.invalidateQueries({ queryKey: ["pricing-documents"] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete the document.");
    }
  };

  const documents = query.data?.documents ?? [];

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Quotes, proposals and invoices with server-computed totals."
        action={
          <Link href="/pricing/new">
            <Button>New document</Button>
          </Link>
        }
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <Field label="Status" className="w-40">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "" | DocumentStatus)}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
            </Select>
          </Field>
        </div>

        {query.isLoading ? (
          <LoadingRow label="Loading documents…" />
        ) : documents.length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Create a document to start pricing line items with discounts and tax."
            action={
              <Link href="/pricing/new">
                <Button variant="secondary">New document</Button>
              </Link>
            }
          />
        ) : (
          <Table className="min-w-[46rem]">
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Customer</Th>
                <Th>Issue date</Th>
                <Th>Status</Th>
                <Th className="text-right">Grand total</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <Td>
                    <Link href={`/pricing/${document.id}`} className="font-medium text-slate-900 hover:underline">
                      {document.title}
                    </Link>
                  </Td>
                  <Td>{document.customer}</Td>
                  <Td>{formatIsoDate(document.issueDate)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[document.status]}>{document.status}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{formatMoney(document.grandTotalMinorUnits)}</Td>
                  <Td className="text-right">
                    {document.status === "draft" ? (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(document)}>
                        Delete
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default PricingDocumentsPage;
