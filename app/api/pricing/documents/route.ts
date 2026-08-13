import { and, desc, eq, gte, lte } from "drizzle-orm";

import { apiRoute, created, newId, ok, readJson, recordAudit, requireUser, validate } from "@/lib/api-utils";
import { computeDocument } from "@/lib/calc/pricing";
import { db, schema } from "@/lib/db";
import { createDocumentSchema, documentsQuerySchema } from "@/lib/validation/pricing";

import { replaceLinesAndRecompute, serializeDocument, serializeDocumentSummary } from "../_lib";

export const GET = apiRoute(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = validate(documentsQuerySchema, {
    status: url.searchParams.get("status") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const conditions = [eq(schema.pricingDocuments.userId, user.id)];
  if (query.status) conditions.push(eq(schema.pricingDocuments.status, query.status));
  if (query.from) conditions.push(gte(schema.pricingDocuments.issueDate, query.from));
  if (query.to) conditions.push(lte(schema.pricingDocuments.issueDate, query.to));

  const documents = await db
    .select()
    .from(schema.pricingDocuments)
    .where(and(...conditions))
    .orderBy(desc(schema.pricingDocuments.issueDate), desc(schema.pricingDocuments.createdAt));

  return ok({ documents: documents.map(serializeDocumentSummary) });
});

export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  const body = validate(createDocumentSchema, await readJson(request));

  // Validate the initial lines up front, so a bad line rejects the whole
  // create instead of leaving behind an empty document.
  if (body.lines.length > 0) {
    computeDocument(body.lines);
  };

  const document = await db.transaction(async (tx) => {
    const id = newId();
    await tx.insert(schema.pricingDocuments).values({
      id,
      userId: user.id,
      title: body.title,
      customer: body.customer,
      issueDate: body.issueDate,
      status: "draft",
    });

    await replaceLinesAndRecompute(tx, id, body.lines);

    await recordAudit(tx, {
      userId: user.id,
      app: "pricing",
      entityType: "document",
      entityId: id,
      action: "document.created",
      detail: { title: body.title, customer: body.customer, lineCount: body.lines.length },
    });

    const [saved] = await tx.select().from(schema.pricingDocuments).where(eq(schema.pricingDocuments.id, id));
    return saved;
  });

  const lines = await db
    .select()
    .from(schema.pricingLineItems)
    .where(eq(schema.pricingLineItems.documentId, document.id));

  return created(serializeDocument(document, lines));
});
