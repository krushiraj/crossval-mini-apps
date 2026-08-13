import { eq } from "drizzle-orm";

import { apiRoute, ok, recordAudit, requireUser } from "@/lib/api-utils";
import { assertDocumentCanBeFinalized, computeDocument } from "@/lib/calc/pricing";
import { db, schema } from "@/lib/db";
import { ConflictError } from "@/lib/errors";

import { loadLines, loadOwnedDocument, serializeDocument, toLineItemInput } from "../../../_lib";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Recomputes totals one last time before freezing the document, so what
// gets frozen is never stale.
export const POST = apiRoute<RouteContext>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;

  const document = await db.transaction(async (tx) => {
    const existing = await loadOwnedDocument(tx, user.id, id);
    if (existing.status === "finalized") {
      throw new ConflictError("ALREADY_FINALIZED", "This document is already finalized.");
    }

    const currentLines = await loadLines(tx, id);
    const lineInputs = currentLines.map(toLineItemInput);
    assertDocumentCanBeFinalized(lineInputs);
    const computation = computeDocument(lineInputs);

    const finalizedAt = new Date();
    await tx
      .update(schema.pricingDocuments)
      .set({
        status: "finalized",
        finalizedAt,
        subtotalMinorUnits: computation.subtotalMinorUnits,
        totalDiscountMinorUnits: computation.totalDiscountMinorUnits,
        totalTaxMinorUnits: computation.totalTaxMinorUnits,
        grandTotalMinorUnits: computation.grandTotalMinorUnits,
        updatedAt: finalizedAt,
      })
      .where(eq(schema.pricingDocuments.id, id));

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: id,
      action: "document.finalized",
      detail: { grandTotalMinorUnits: computation.grandTotalMinorUnits },
    });

    const [updated] = await tx.select().from(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, id));
    return updated;
  });

  const lines = await loadLines(db, document.id);
  return ok(serializeDocument(document, lines));
});
