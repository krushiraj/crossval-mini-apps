import { eq } from "drizzle-orm";

import { apiRoute, created, newId, recordAudit, requireUser } from "@/lib/api-utils";
import { db, schema } from "@/lib/db";
import { todayIsoDate } from "@/lib/dates";

import { loadLines, loadOwnedDocument, replaceLinesAndRecompute, serializeDocument, toLineItemInput } from "../../../_lib";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// The sanctioned way to edit a finalized document: copy it into a new draft.
// Issue date defaults to today since it's a new document, not a re-issue.
export const POST = apiRoute<RouteContext>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;

  const newDocument = await db.transaction(async (tx) => {
    const source = await loadOwnedDocument(tx, user.id, id);
    const sourceLines = await loadLines(tx, source.id);

    const newDocumentId = newId();
    await tx.insert(schema.pricingDocuments).values({
      id: newDocumentId,
      userId: user.id,
      title: source.title,
      customer: source.customer,
      issueDate: todayIsoDate(),
      status: "draft",
      duplicatedFromId: source.id,
    });

    await replaceLinesAndRecompute(tx, newDocumentId, sourceLines.map(toLineItemInput));

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: newDocumentId,
      action: "document.duplicated",
      detail: { duplicatedFromId: source.id },
    });
    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: source.id,
      action: "document.duplicated_into",
      detail: { newDocumentId },
    });

    const [saved] = await tx.select().from(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, newDocumentId));
    return saved;
  });

  const lines = await loadLines(db, newDocument.id);
  return created(serializeDocument(newDocument, lines));
});
