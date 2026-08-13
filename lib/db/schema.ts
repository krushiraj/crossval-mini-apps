// A few rules hold across every table here:
//   - money is a whole number of cents, never a decimal
//   - percentages are basis points, so 5% is 500
//   - dates someone picks are "YYYY-MM-DD" text, because they're days rather
//     than moments and shouldn't carry a timezone
//   - anything a user owns has a userId, and every query filters on it

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

// Users and sessions (table shape required by Better Auth)

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Audit trail, shared by all three apps

// Append-only record of who changed what. Rows are written in the same
// transaction as the change they describe, so the trail can never be missing
// an entry for a change that did happen.
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // "pricing" | "orders" | "planner"
    app: text("app").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    // e.g. "document.finalized", "payment.recorded", "payment.rejected"
    action: text("action").notNull(),
    // JSON with whatever context the action needs.
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_log_entity_idx").on(table.userId, table.entityType, table.entityId),
    index("audit_log_user_created_idx").on(table.userId, table.createdAt),
  ],
);

// Multi-Rate Pricing Calculator

export const pricingDocuments = sqliteTable(
  "pricing_documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    customer: text("customer").notNull(),
    // "YYYY-MM-DD"
    issueDate: text("issue_date").notNull(),
    // "draft" | "finalized"
    status: text("status").notNull().default("draft"),
    // Totals are worked out by the server on every write and frozen when the
    // document is finalized. Storing them keeps the date-range report a simple
    // sum instead of recalculating every line of every document.
    subtotalMinorUnits: integer("subtotal_minor_units").notNull().default(0),
    totalDiscountMinorUnits: integer("total_discount_minor_units").notNull().default(0),
    totalTaxMinorUnits: integer("total_tax_minor_units").notNull().default(0),
    grandTotalMinorUnits: integer("grand_total_minor_units").notNull().default(0),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    // Set when this draft was made by duplicating a finalized document.
    duplicatedFromId: text("duplicated_from_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("pricing_documents_user_issue_date_idx").on(table.userId, table.issueDate),
    index("pricing_documents_user_status_idx").on(table.userId, table.status),
  ],
);

export const pricingLineItems = sqliteTable(
  "pricing_line_items",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => pricingDocuments.id, { onDelete: "cascade" }),
    // Keeps the order the user put the lines in.
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinorUnits: integer("unit_price_minor_units").notNull(),
    // "percent" | "fixed" | null
    discountType: text("discount_type"),
    // Basis points when percent, cents when fixed, 0 when there is no discount.
    discountValue: integer("discount_value").notNull().default(0),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(0),
    // Worked out on every write, same as the document totals.
    subtotalMinorUnits: integer("subtotal_minor_units").notNull().default(0),
    discountMinorUnits: integer("discount_minor_units").notNull().default(0),
    taxMinorUnits: integer("tax_minor_units").notNull().default(0),
    totalMinorUnits: integer("total_minor_units").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index("pricing_line_items_document_idx").on(table.documentId, table.position)],
);
