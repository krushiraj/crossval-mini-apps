// Database schema.
//
// Rules used everywhere:
//   - Money is stored as a whole number of cents. Never a decimal.
//   - Rates are stored as basis points, so 5% is 500.
//   - Dates people pick (issue date, due date) are "YYYY-MM-DD" text. They are
//     dates, not points in time, so storing them as timestamps would drag
//     timezones into it.
//   - Bookkeeping timestamps are unix milliseconds.
//   - Every table a user owns has a userId, and every query filters on it.

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

// --------------------------------------------------------------------------
// Users and sessions (table shape required by Better Auth)
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// Audit trail, shared by all three apps
// --------------------------------------------------------------------------

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


