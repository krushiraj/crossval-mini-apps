import { describe, expect, it } from "vitest";

import { assertDraft, serializeDocument, serializeDocumentSummary, toLineItemInput } from "@/app/api/pricing/_lib";
import { ConflictError } from "@/lib/errors";
import {
  createDocumentSchema,
  createLineSchema,
  documentsQuerySchema,
  reportQuerySchema,
  replaceLinesSchema,
  updateDocumentSchema,
  updateLineSchema,
} from "@/lib/validation/pricing";

// A row shaped like what Drizzle returns for `pricingDocuments`.
const fakeDocumentRow = (overrides: Partial<Parameters<typeof serializeDocumentSummary>[0]> = {}) => {
  return {
    id: "doc_1",
    userId: "user_1",
    title: "Quote for Acme",
    customer: "Acme Co",
    issueDate: "2026-01-15",
    status: "draft",
    subtotalMinorUnits: 10_000,
    totalDiscountMinorUnits: 500,
    totalTaxMinorUnits: 250,
    grandTotalMinorUnits: 9_750,
    finalizedAt: null,
    duplicatedFromId: null,
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
    updatedAt: new Date("2026-01-15T00:00:00.000Z"),
    ...overrides,
  } as unknown as Parameters<typeof serializeDocumentSummary>[0];
};

const fakeLineRow = (overrides: Partial<Parameters<typeof toLineItemInput>[0]> = {}) => {
  return {
    id: "line_1",
    documentId: "doc_1",
    position: 0,
    description: "Widget A",
    quantity: 2,
    unitPriceMinorUnits: 10_000,
    discountType: "percent",
    discountValue: 1_000,
    taxRateBasisPoints: 500,
    subtotalMinorUnits: 20_000,
    discountMinorUnits: 2_000,
    taxMinorUnits: 900,
    totalMinorUnits: 18_900,
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
    ...overrides,
  } as unknown as Parameters<typeof toLineItemInput>[0];
};

describe("assertDraft: the single immutability guard", () => {
  it("does not throw for a draft document", () => {
    expect(() => assertDraft(fakeDocumentRow({ status: "draft" }))).not.toThrow();
  });

  it("throws a 409 DOCUMENT_FINALIZED for a finalized document", () => {
    try {
      assertDraft(fakeDocumentRow({ status: "finalized" }));
      throw new Error("expected assertDraft to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      const conflict = error as ConflictError;
      expect(conflict.status).toBe(409);
      expect(conflict.code).toBe("DOCUMENT_FINALIZED");
    }
  });
});

describe("toLineItemInput: DB row -> calc module input", () => {
  it("maps every calc-relevant field", () => {
    expect(toLineItemInput(fakeLineRow())).toEqual({
      description: "Widget A",
      quantity: 2,
      unitPriceMinorUnits: 10_000,
      discountType: "percent",
      discountValue: 1_000,
      taxRateBasisPoints: 500,
    });
  });

  it("normalizes a null discount type", () => {
    expect(toLineItemInput(fakeLineRow({ discountType: null, discountValue: 0 })).discountType).toBeNull();
  });
});

describe("serializers never leak DB internals", () => {
  it("omits userId and formats timestamps as ISO strings", () => {
    const summary = serializeDocumentSummary(fakeDocumentRow());
    expect(summary).not.toHaveProperty("userId");
    expect(summary.createdAt).toBe("2026-01-15T00:00:00.000Z");
    expect(summary.finalizedAt).toBeNull();
  });

  it("includes serialized line items on the full document", () => {
    const document = serializeDocument(fakeDocumentRow(), [fakeLineRow()]);
    expect(document.lines).toHaveLength(1);
    expect(document.lines[0]).toMatchObject({ id: "line_1", totalMinorUnits: 18_900 });
    expect(document.lines[0]).not.toHaveProperty("documentId");
  });
});

describe("validation: documents", () => {
  it("accepts a minimal valid create payload", () => {
    const result = createDocumentSchema.safeParse({
      title: "Quote",
      customer: "Acme",
      issueDate: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank title with a specific message", () => {
    const result = createDocumentSchema.safeParse({ title: "", customer: "Acme", issueDate: "2026-01-15" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Title is required.");
  });

  // Nothing capped these once, so a single request could store a megabyte.
  it("rejects an over-long title in the app's own words", () => {
    const result = createDocumentSchema.safeParse({
      title: "x".repeat(201),
      customer: "Acme",
      issueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Title must be 200 characters or fewer.");
  });

  it("rejects an over-long customer, on update as well as create", () => {
    const long = "x".repeat(201);
    expect(
      createDocumentSchema.safeParse({ title: "Quote", customer: long, issueDate: "2026-01-15" }).success,
    ).toBe(false);
    const update = updateDocumentSchema.safeParse({ customer: long });
    expect(update.success).toBe(false);
    expect(update.error?.issues[0]?.message).toBe("Customer must be 200 characters or fewer.");
  });

  it("accepts a title of exactly 200 characters", () => {
    const result = createDocumentSchema.safeParse({
      title: "x".repeat(200),
      customer: "Acme",
      issueDate: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed issue date", () => {
    const result = createDocumentSchema.safeParse({ title: "Quote", customer: "Acme", issueDate: "01/15/2026" });
    expect(result.success).toBe(false);
  });

  it("rejects an update with no fields at all", () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(false);
  });

  it("accepts an update with just one field", () => {
    expect(updateDocumentSchema.safeParse({ title: "New title" }).success).toBe(true);
  });

  it("rejects an unknown status filter", () => {
    expect(documentsQuerySchema.safeParse({ status: "archived" }).success).toBe(false);
  });
});

describe("validation: line items", () => {
  it("rejects a negative quantity with a specific message", () => {
    const result = createLineSchema.safeParse({
      description: "Widget",
      quantity: -1,
      unitPriceMinorUnits: 100,
      discountType: null,
      discountValue: 0,
      taxRateBasisPoints: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Quantity must be at least 1.");
  });

  it("rejects a negative unit price", () => {
    const result = createLineSchema.safeParse({
      description: "Widget",
      quantity: 1,
      unitPriceMinorUnits: -50,
      discountType: null,
      discountValue: 0,
      taxRateBasisPoints: 0,
    });
    expect(result.success).toBe(false);
  });

  it("defaults discountType to null and rate fields to zero when omitted", () => {
    const result = createLineSchema.safeParse({ description: "Widget", quantity: 1, unitPriceMinorUnits: 100 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountType).toBeNull();
      expect(result.data.discountValue).toBe(0);
      expect(result.data.taxRateBasisPoints).toBe(0);
    }
  });

  it("replaceLinesSchema accepts an empty array (clearing all lines)", () => {
    expect(replaceLinesSchema.safeParse({ lines: [] }).success).toBe(true);
  });

  it("updateLineSchema rejects an empty patch", () => {
    expect(updateLineSchema.safeParse({}).success).toBe(false);
  });

  it("updateLineSchema accepts a partial patch", () => {
    expect(updateLineSchema.safeParse({ quantity: 3 }).success).toBe(true);
  });
});

describe("validation: report date range", () => {
  it("accepts from <= to", () => {
    expect(reportQuerySchema.safeParse({ from: "2026-01-01", to: "2026-01-31" }).success).toBe(true);
  });

  it("rejects from > to", () => {
    const result = reportQuerySchema.safeParse({ from: "2026-02-01", to: "2026-01-01" });
    expect(result.success).toBe(false);
  });
});
