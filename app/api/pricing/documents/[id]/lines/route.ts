import { eq } from "drizzle-orm";

import { apiRoute, created, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { db, schema } from "@/lib/db";
import { createLineSchema, replaceLinesSchema } from "@/lib/validation/pricing";

import {
  assertDraft,
  loadLines,
  loadOwnedDocument,
  replaceLinesAndRecompute,
  serializeDocument,
  toLineItemInput,
} from "../../../_lib";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Full replace is the simplest correct way to save an edited table of
// lines: validate the whole set, recompute, and persist in one transaction.
export const PUT = apiRoute<RouteContext>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = validate(replaceLinesSchema, await readJson(request));

  const document = await db.transaction(async (tx) => {
    const existing = await loadOwnedDocument(tx, user.id, id);
    assertDraft(existing);

    await replaceLinesAndRecompute(tx, id, body.lines);

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: id,
      action: "document.lines_replaced",
      detail: { lineCount: body.lines.length },
    });

    const [updated] = await tx.select().from(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, id));
    return updated;
  });

  const lines = await loadLines(db, document.id);
  return ok(serializeDocument(document, lines));
});

export const POST = apiRoute<RouteContext>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = validate(createLineSchema, await readJson(request));

  const document = await db.transaction(async (tx) => {
    const existing = await loadOwnedDocument(tx, user.id, id);
    assertDraft(existing);

    const currentLines = await loadLines(tx, id);
    const nextLines = [...currentLines.map(toLineItemInput), body];

    await replaceLinesAndRecompute(tx, id, nextLines);

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: id,
      action: "document.line_added",
      detail: { description: body.description },
    });

    const [updated] = await tx.select().from(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, id));
    return updated;
  });

  const lines = await loadLines(db, document.id);
  return created(serializeDocument(document, lines));
});
