import { eq } from "drizzle-orm";

import { apiRoute, noContent, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db, schema } from "@/lib/db";
import { updateDocumentSchema } from "@/lib/validation/pricing";

import { assertDraft, loadLines, loadOwnedDocument, serializeDocument } from "../../_lib";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = apiRoute<RouteContext>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const document = await loadOwnedDocument(db, user.id, id);
  const lines = await loadLines(db, document.id);
  return ok(serializeDocument(document, lines));
});

export const PATCH = apiRoute<RouteContext>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = validate(updateDocumentSchema, await readJson(request));

  const document = await db.transaction(async (tx) => {
    const existing = await loadOwnedDocument(tx, user.id, id);
    assertDraft(existing);

    await tx
      .update(schema.pricingDocuments)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.customer !== undefined ? { customer: body.customer } : {}),
        ...(body.issueDate !== undefined ? { issueDate: body.issueDate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.pricingDocuments.id, id));

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: id,
      action: "document.updated",
      detail: body,
    });

    const [updated] = await tx.select().from(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, id));
    return updated;
  });

  const lines = await loadLines(db, document.id);
  return ok(serializeDocument(document, lines));
});

export const DELETE = apiRoute<RouteContext>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;

  await db.transaction(async (tx) => {
    const existing = await loadOwnedDocument(tx, user.id, id);
    assertDraft(existing);

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: id,
      action: "document.deleted",
      detail: { title: existing.title, customer: existing.customer },
    });

    await tx.delete(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, id));
  });

  return noContent();
});
