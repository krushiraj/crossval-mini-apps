// Seeds a demo account with the sample data from all three assignment briefs,
// so a reviewer lands on meaningful screens instead of empty states.
//
//   yarn db:seed
//
// Re-running deletes and recreates the demo user's data. It never touches any
// other account.

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { auth } from "@/lib/auth";
import { computeOrderTotal } from "@/lib/calc/orders";
import { computeDocument, type LineItemInput } from "@/lib/calc/pricing";
import { db } from "@/lib/db";
import {
  actuals,
  auditLog,
  categories,
  orderLineItems,
  orders,
  payments,
  periodLocks,
  plans,
  pricingDocuments,
  pricingLineItems,
  user,
} from "@/lib/db/schema";

const DEMO_EMAIL = "demo@crossval.test";
const DEMO_PASSWORD = "demo12345";
const DEMO_NAME = "Demo Reviewer";

const daysFromToday = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const findOrCreateDemoUser = async (): Promise<string> => {
  const [existing] = await db.select().from(user).where(eq(user.email, DEMO_EMAIL));
  if (existing) return existing.id;

  const result = await auth.api.signUpEmail({
    body: { name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  if (!result.user) throw new Error("Could not create the demo user");
  return result.user.id;
};

const clearDemoData = async (userId: string): Promise<void> => {
  // Child rows go first where there is no cascade from the user.
  const documents = await db
    .select({ id: pricingDocuments.id })
    .from(pricingDocuments)
    .where(eq(pricingDocuments.userId, userId));
  for (const document of documents) {
    await db.delete(pricingLineItems).where(eq(pricingLineItems.documentId, document.id));
  }
  await db.delete(pricingDocuments).where(eq(pricingDocuments.userId, userId));

  const existingOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.userId, userId));
  for (const order of existingOrders) {
    await db.delete(orderLineItems).where(eq(orderLineItems.orderId, order.id));
  }
  await db.delete(payments).where(eq(payments.userId, userId));
  await db.delete(orders).where(eq(orders.userId, userId));

  await db.delete(actuals).where(eq(actuals.userId, userId));
  await db.delete(plans).where(eq(plans.userId, userId));
  await db.delete(periodLocks).where(eq(periodLocks.userId, userId));
  await db.delete(categories).where(eq(categories.userId, userId));
  await db.delete(auditLog).where(eq(auditLog.userId, userId));
};

// --------------------------------------------------------------------------
// App 1 — Pricing
// --------------------------------------------------------------------------

interface SeedDocument {
  title: string;
  customer: string;
  issueDate: string;
  status: "draft" | "finalized";
  lines: Array<LineItemInput & { description: string }>;
}

// The worked example from the pricing brief: totals 450.00 / 40.00 / 11.50 / 421.50.
const SAMPLE_LINES: Array<LineItemInput & { description: string }> = [
  {
    description: "Widget A",
    quantity: 2,
    unitPriceMinorUnits: 10_000,
    discountType: "percent",
    discountValue: 1_000,
    taxRateBasisPoints: 500,
  },
  {
    description: "Widget B",
    quantity: 1,
    unitPriceMinorUnits: 5_000,
    discountType: null,
    discountValue: 0,
    taxRateBasisPoints: 500,
  },
  {
    description: "Service fee",
    quantity: 1,
    unitPriceMinorUnits: 20_000,
    discountType: "fixed",
    discountValue: 2_000,
    taxRateBasisPoints: 0,
  },
];

const SEED_DOCUMENTS: SeedDocument[] = [
  {
    title: "Sample document from the brief",
    customer: "Acme Corp",
    issueDate: "2026-01-15",
    status: "draft",
    lines: SAMPLE_LINES,
  },
  {
    title: "Q1 platform retainer",
    customer: "Northwind Trading",
    issueDate: "2026-02-01",
    status: "finalized",
    lines: [
      {
        description: "Implementation retainer",
        quantity: 3,
        unitPriceMinorUnits: 250_000,
        discountType: "percent",
        discountValue: 500,
        taxRateBasisPoints: 500,
      },
      {
        description: "Onboarding workshop",
        quantity: 1,
        unitPriceMinorUnits: 120_000,
        discountType: null,
        discountValue: 0,
        taxRateBasisPoints: 500,
      },
    ],
  },
  {
    title: "Hardware refresh quote",
    customer: "Blue Harbour Logistics",
    issueDate: "2026-03-08",
    status: "finalized",
    lines: [
      {
        description: "Laptop (14 inch)",
        quantity: 12,
        unitPriceMinorUnits: 149_900,
        discountType: "fixed",
        discountValue: 50_000,
        taxRateBasisPoints: 500,
      },
      {
        description: "Docking station",
        quantity: 12,
        unitPriceMinorUnits: 19_900,
        discountType: null,
        discountValue: 0,
        taxRateBasisPoints: 500,
      },
    ],
  },
];

const seedPricing = async (userId: string): Promise<void> => {
  for (const seed of SEED_DOCUMENTS) {
    const computed = computeDocument(seed.lines);
    const documentId = nanoid();

    await db.insert(pricingDocuments).values({
      id: documentId,
      userId,
      title: seed.title,
      customer: seed.customer,
      issueDate: seed.issueDate,
      status: seed.status,
      subtotalMinorUnits: computed.subtotalMinorUnits,
      totalDiscountMinorUnits: computed.totalDiscountMinorUnits,
      totalTaxMinorUnits: computed.totalTaxMinorUnits,
      grandTotalMinorUnits: computed.grandTotalMinorUnits,
      finalizedAt: seed.status === "finalized" ? new Date() : null,
    });

    await db.insert(pricingLineItems).values(
      seed.lines.map((line, index) => ({
        id: nanoid(),
        documentId,
        position: index,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinorUnits: line.unitPriceMinorUnits,
        discountType: line.discountType,
        discountValue: line.discountValue,
        taxRateBasisPoints: line.taxRateBasisPoints,
        subtotalMinorUnits: computed.lines[index].subtotalMinorUnits,
        discountMinorUnits: computed.lines[index].discountMinorUnits,
        taxMinorUnits: computed.lines[index].taxMinorUnits,
        totalMinorUnits: computed.lines[index].totalMinorUnits,
      })),
    );

    if (seed.status === "finalized") {
      await db.insert(auditLog).values({
        id: nanoid(),
        userId,
        app: "pricing",
        entityType: "document",
        entityId: documentId,
        action: "document.finalized",
        detail: JSON.stringify({ grandTotalMinorUnits: computed.grandTotalMinorUnits }),
      });
    }
  }
};

// --------------------------------------------------------------------------
// App 2 — Orders
// --------------------------------------------------------------------------

interface SeedOrder {
  customer: string;
  dueDate: string;
  lines: Array<{ description: string; quantity: number; unitPriceMinorUnits: number }>;
  payments: Array<{ amountMinorUnits: number; paidDate: string; note?: string }>;
}

const SEED_ORDERS: SeedOrder[] = [
  {
    // The sample scenario from the brief, left partially paid so the reviewer
    // can finish it and watch the status change.
    customer: "Acme Corp",
    dueDate: daysFromToday(7),
    lines: [{ description: "Annual licence", quantity: 2, unitPriceMinorUnits: 50_000 }],
    payments: [
      { amountMinorUnits: 40_000, paidDate: daysFromToday(-1), note: "Part payment by transfer" },
    ],
  },
  {
    customer: "Northwind Trading",
    dueDate: daysFromToday(21),
    lines: [
      { description: "Implementation", quantity: 1, unitPriceMinorUnits: 350_000 },
      { description: "Training day", quantity: 2, unitPriceMinorUnits: 75_000 },
    ],
    payments: [{ amountMinorUnits: 500_000, paidDate: daysFromToday(-3), note: "Paid in full" }],
  },
  {
    // Past its due date with nothing paid: shows as overdue.
    customer: "Blue Harbour Logistics",
    dueDate: daysFromToday(-9),
    lines: [{ description: "Freight audit", quantity: 1, unitPriceMinorUnits: 180_000 }],
    payments: [],
  },
  {
    customer: "Cedar & Co",
    dueDate: daysFromToday(14),
    lines: [{ description: "Advisory retainer", quantity: 1, unitPriceMinorUnits: 220_000 }],
    payments: [],
  },
];

const seedOrders = async (userId: string): Promise<void> => {
  for (const seed of SEED_ORDERS) {
    const orderId = nanoid();
    // Uses the shared calc module, exactly like the API, so seed data can't
    // disagree with data created through the app.
    const computed = computeOrderTotal(seed.lines);

    await db.insert(orders).values({
      id: orderId,
      userId,
      customer: seed.customer,
      dueDate: seed.dueDate,
      totalMinorUnits: computed.totalMinorUnits,
    });

    await db.insert(orderLineItems).values(
      seed.lines.map((line, index) => ({
        id: nanoid(),
        orderId,
        position: index,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinorUnits: line.unitPriceMinorUnits,
        lineTotalMinorUnits: computed.lines[index].lineTotalMinorUnits,
      })),
    );

    for (const payment of seed.payments) {
      const paymentId = nanoid();
      await db.insert(payments).values({
        id: paymentId,
        orderId,
        userId,
        amountMinorUnits: payment.amountMinorUnits,
        paidDate: payment.paidDate,
        note: payment.note ?? null,
        idempotencyKey: null,
      });
      await db.insert(auditLog).values({
        id: nanoid(),
        userId,
        app: "orders",
        entityType: "order",
        entityId: orderId,
        action: "payment.recorded",
        detail: JSON.stringify({
          paymentId,
          amountMinorUnits: payment.amountMinorUnits,
        }),
      });
    }
  }
};

// --------------------------------------------------------------------------
// App 3 — Planner
// --------------------------------------------------------------------------

const SEED_CATEGORIES = ["Marketing", "Payroll", "Tools"];

// Plans and actuals from the brief's sample table (Marketing Feb intentionally omitted).
const SEED_PLANS: Array<{ category: string; month: string; amountMinorUnits: number }> = [
  { category: "Marketing", month: "2026-01", amountMinorUnits: 500_000 },
  { category: "Payroll", month: "2026-01", amountMinorUnits: 2_000_000 },
  { category: "Marketing", month: "2026-02", amountMinorUnits: 500_000 },
  { category: "Payroll", month: "2026-02", amountMinorUnits: 2_000_000 },
  { category: "Tools", month: "2026-01", amountMinorUnits: 120_000 },
  { category: "Tools", month: "2026-02", amountMinorUnits: 120_000 },
];

const SEED_ACTUALS: Array<{
  category: string;
  month: string;
  amountMinorUnits: number;
  note?: string;
}> = [
  { category: "Marketing", month: "2026-01", amountMinorUnits: 480_000, note: "Q1 campaign" },
  { category: "Payroll", month: "2026-01", amountMinorUnits: 2_050_000 },
  { category: "Payroll", month: "2026-02", amountMinorUnits: 1_980_000 },
  { category: "Tools", month: "2026-01", amountMinorUnits: 95_000, note: "Annual licences" },
  { category: "Tools", month: "2026-01", amountMinorUnits: 32_500, note: "Extra seats" },
];

const seedPlanner = async (userId: string): Promise<void> => {
  const categoryIds = new Map<string, string>();

  for (const name of SEED_CATEGORIES) {
    const id = nanoid();
    categoryIds.set(name, id);
    await db.insert(categories).values({ id, userId, name });
  };

  for (const plan of SEED_PLANS) {
    await db.insert(plans).values({
      id: nanoid(),
      userId,
      categoryId: categoryIds.get(plan.category)!,
      month: plan.month,
      amountMinorUnits: plan.amountMinorUnits,
    });
  }

  for (const actual of SEED_ACTUALS) {
    await db.insert(actuals).values({
      id: nanoid(),
      userId,
      categoryId: categoryIds.get(actual.category)!,
      month: actual.month,
      amountMinorUnits: actual.amountMinorUnits,
      note: actual.note ?? null,
    });
  }

  // A closed period, so the locked-state behaviour is visible immediately.
  await db.insert(periodLocks).values({ id: nanoid(), userId, month: "2025-12" });
  await db.insert(auditLog).values({
    id: nanoid(),
    userId,
    app: "planner",
    entityType: "period",
    entityId: "2025-12",
    action: "period.locked",
  });
};

const main = async (): Promise<void> => {
  const userId = await findOrCreateDemoUser();
  console.log(`Seeding data for ${DEMO_EMAIL}`);

  await clearDemoData(userId);
  await seedPricing(userId);
  await seedOrders(userId);
  await seedPlanner(userId);

  console.log(`
Seed complete.

  Sign in with:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}

  Pricing  ${SEED_DOCUMENTS.length} documents (1 draft matching the brief's worked example, 2 finalized)
  Orders   ${SEED_ORDERS.length} orders covering pending, partially paid, paid and overdue
  Planner  ${SEED_CATEGORIES.length} categories with Q1 2026 plans and actuals, December 2025 locked
`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
