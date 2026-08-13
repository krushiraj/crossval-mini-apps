import { eq } from "drizzle-orm";

import { apiRoute, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db, schema } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { updateLineSchema } from "@/lib/validation/pricing";

import {
  assertDraft,
  loadLines,
  loadOwnedDocument,
  replaceLinesAndRecompute,
  serializeDocument,
  toLineItemInput,
} from "../../../../_lib";

interface RouteContext {
  params: Promise<{ id: string; lineId: string }>;
}

export const PATCH = apiRoute<RouteContext>(async (request, { params }) => {
  const user = await requireUser();
  const { id, lineId } = await params;
  const patch = validate(updateLineSchema, await readJson(request));

  const document = await db.transaction(async (tx) => {
    const existing = await loadOwnedDocument(tx, user.id, id);
    assertDraft(existing);

    const currentLines = await loadLines(tx, id);
    const targetIndex = currentLines.findIndex((line) => line.id === lineId);
    if (targetIndex === -1) {
      throw new NotFoundError("Line item not found.");
    };

    const nextLines = currentLines.map(toLineItemInput);
    nextLines[targetIndex] = { ...nextLines[targetIndex], ...patch };

    await replaceLinesAndRecompute(tx, id, nextLines);

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: id,
      action: "document.line_updated",
      detail: { lineId, patch },
    });

    const [updated] = await tx.select().from(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, id));
    return updated;
  });

  const lines = await loadLines(db, document.id);
  return ok(serializeDocument(document, lines));
});

export const DELETE = apiRoute<RouteContext>(async (_request, { params }) => {
  const user = await requireUser();
  const { id, lineId } = await params;

  const document = await db.transaction(async (tx) => {
    const existing = await loadOwnedDocument(tx, user.id, id);
    assertDraft(existing);

    const currentLines = await loadLines(tx, id);
    if (!currentLines.some((line) => line.id === lineId)) {
      throw new NotFoundError("Line item not found.");
    };

    const nextLines = currentLines.filter((line) => line.id !== lineId).map(toLineItemInput);

    await replaceLinesAndRecompute(tx, id, nextLines);

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: id,
      action: "document.line_removed",
      detail: { lineId },
    });

    const [updated] = await tx.select().from(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, id));
    return updated;
  });

  const lines = await loadLines(db, document.id);
  return ok(serializeDocument(document, lines));
});
