// Shapes returned by the /api/pricing endpoints. Mirrors app/api/pricing/_lib.ts's serializers.

export type DiscountType = "percent" | "fixed";
export type DocumentStatus = "draft" | "finalized";

export interface PricingLine {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPriceMinorUnits: number;
  discountType: DiscountType | null;
  discountValue: number;
  taxRateBasisPoints: number;
  subtotalMinorUnits: number;
  discountMinorUnits: number;
  taxMinorUnits: number;
  totalMinorUnits: number;
}

export interface PricingDocumentSummary {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: DocumentStatus;
  finalizedAt: string | null;
  duplicatedFromId: string | null;
  subtotalMinorUnits: number;
  totalDiscountMinorUnits: number;
  totalTaxMinorUnits: number;
  grandTotalMinorUnits: number;
  createdAt: string;
  updatedAt: string;
}

export interface PricingDocument extends PricingDocumentSummary {
  lines: PricingLine[];
}

export interface PricingReport {
  from: string;
  to: string;
  documentCount: number;
  grandTotalMinorUnits: number;
  totalTaxMinorUnits: number;
  totalDiscountMinorUnits: number;
}
