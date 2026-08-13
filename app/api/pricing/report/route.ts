import { and, eq, gte, lte, sql } from "drizzle-orm";

import { apiRoute, ok, requireUser, validate } from "@/lib/api-utils";
import { db, schema } from "@/lib/db";
import { reportQuerySchema } from "@/lib/validation/pricing";

// Aggregates over stored totals rather than recomputing from line items, so
// it's a cheap SQL sum. Includes drafts, not just finalized documents.
export const GET = apiRoute(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = validate(reportQuerySchema, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const [row] = await db
    .select({
      documentCount: sql<number>`count(*)`,
      grandTotalMinorUnits: sql<number>`coalesce(sum(${schema.pricingDocuments.grandTotalMinorUnits}), 0)`,
      totalTaxMinorUnits: sql<number>`coalesce(sum(${schema.pricingDocuments.totalTaxMinorUnits}), 0)`,
      totalDiscountMinorUnits: sql<number>`coalesce(sum(${schema.pricingDocuments.totalDiscountMinorUnits}), 0)`,
    })
    .from(schema.pricingDocuments)
    .where(
      and(
        eq(schema.pricingDocuments.userId, user.id),
        gte(schema.pricingDocuments.issueDate, query.from),
        lte(schema.pricingDocuments.issueDate, query.to),
      ),
    );

  return ok({
    from: query.from,
    to: query.to,
    documentCount: Number(row?.documentCount ?? 0),
    grandTotalMinorUnits: Number(row?.grandTotalMinorUnits ?? 0),
    totalTaxMinorUnits: Number(row?.totalTaxMinorUnits ?? 0),
    totalDiscountMinorUnits: Number(row?.totalDiscountMinorUnits ?? 0),
  });
});
