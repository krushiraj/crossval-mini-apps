import { and, asc, eq } from "drizzle-orm";

import { computeDocument } from "@/lib/calc/pricing";
import type { LineItemInput } from "@/lib/calc/pricing";
import { newId } from "@/lib/api-utils";
import type { DatabaseOrTransaction } from "@/lib/db";
import { schema } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";

export type PricingDocumentRow = typeof schema.pricingDocuments.$inferSelect;
export type PricingLineItemRow = typeof schema.pricingLineItems.$inferSelect;

export const loadOwnedDocument = async (
  db: DatabaseOrTransaction,
  userId: string,
  documentId: string,
): Promise<PricingDocumentRow> => {
  const [document] = await db
    .select()
    .from(schema.pricingDocuments)
    .where(and(eq(schema.pricingDocuments.id, documentId), eq(schema.pricingDocuments.userId, userId)))
    .limit(1);

  if (!document) {
    throw new NotFoundError("Document not found.");
  }
  return document;
};

export const assertDraft = (document: PricingDocumentRow): void => {
  if (document.status === "finalized") {
    throw new ConflictError(
      "DOCUMENT_FINALIZED",
      "This document is finalized and can no longer be edited. Duplicate it to make changes.",
    );
  }
};

export const loadLines = async (
  db: DatabaseOrTransaction,
  documentId: string,
): Promise<PricingLineItemRow[]> => {
  return db
    .select()
    .from(schema.pricingLineItems)
    .where(eq(schema.pricingLineItems.documentId, documentId))
    .orderBy(asc(schema.pricingLineItems.position));
};

export const toLineItemInput = (row: PricingLineItemRow): LineItemInput => {
  return {
    description: row.description,
    quantity: row.quantity,
    unitPriceMinorUnits: row.unitPriceMinorUnits,
    discountType: (row.discountType as LineItemInput["discountType"]) ?? null,
    discountValue: row.discountValue,
    taxRateBasisPoints: row.taxRateBasisPoints,
  };
};

// Deletes and re-inserts every line rather than diffing, so full replace
// and single-line CRUD can share this one code path.
export const replaceLinesAndRecompute = async (
  tx: DatabaseOrTransaction,
  documentId: string,
  lines: LineItemInput[],
) => {
  const computation = computeDocument(lines);

  await tx.delete(schema.pricingLineItems).where(eq(schema.pricingLineItems.documentId, documentId));

  if (lines.length > 0) {
    await tx.insert(schema.pricingLineItems).values(
      lines.map((line, index) => ({
        id: newId(),
        documentId,
        position: index,
        description: line.description ?? "",
        quantity: line.quantity,
        unitPriceMinorUnits: line.unitPriceMinorUnits,
        discountType: line.discountType,
        discountValue: line.discountValue,
        taxRateBasisPoints: line.taxRateBasisPoints,
        subtotalMinorUnits: computation.lines[index].subtotalMinorUnits,
        discountMinorUnits: computation.lines[index].discountMinorUnits,
        taxMinorUnits: computation.lines[index].taxMinorUnits,
        totalMinorUnits: computation.lines[index].totalMinorUnits,
      })),
    );
  }

  await tx
    .update(schema.pricingDocuments)
    .set({
      subtotalMinorUnits: computation.subtotalMinorUnits,
      totalDiscountMinorUnits: computation.totalDiscountMinorUnits,
      totalTaxMinorUnits: computation.totalTaxMinorUnits,
      grandTotalMinorUnits: computation.grandTotalMinorUnits,
      updatedAt: new Date(),
    })
    .where(eq(schema.pricingDocuments.id, documentId));

  return computation;
};

export const serializeLine = (line: PricingLineItemRow) => {
  return {
    id: line.id,
    position: line.position,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinorUnits: line.unitPriceMinorUnits,
    discountType: line.discountType as "percent" | "fixed" | null,
    discountValue: line.discountValue,
    taxRateBasisPoints: line.taxRateBasisPoints,
    subtotalMinorUnits: line.subtotalMinorUnits,
    discountMinorUnits: line.discountMinorUnits,
    taxMinorUnits: line.taxMinorUnits,
    totalMinorUnits: line.totalMinorUnits,
  };
};

export const serializeDocumentSummary = (document: PricingDocumentRow) => {
  return {
    id: document.id,
    title: document.title,
    customer: document.customer,
    issueDate: document.issueDate,
    status: document.status as "draft" | "finalized",
    finalizedAt: document.finalizedAt ? document.finalizedAt.toISOString() : null,
    duplicatedFromId: document.duplicatedFromId,
    subtotalMinorUnits: document.subtotalMinorUnits,
    totalDiscountMinorUnits: document.totalDiscountMinorUnits,
    totalTaxMinorUnits: document.totalTaxMinorUnits,
    grandTotalMinorUnits: document.grandTotalMinorUnits,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
};

export const serializeDocument = (document: PricingDocumentRow, lines: PricingLineItemRow[]) => {
  return {
    ...serializeDocumentSummary(document),
    lines: lines.map(serializeLine),
  };
};
