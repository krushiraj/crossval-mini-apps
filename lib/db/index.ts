import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

// Local development falls back to an on-disk SQLite file so the app runs with
// no cloud credentials. Production points at Turso (hosted libSQL), which
// speaks the same protocol — the only difference is the URL and auth token.
const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const libsql = createClient({ url, authToken });

export const db = drizzle(libsql, { schema });

export type Database = typeof db;

// A drizzle handle that may be either the pooled db or an open transaction.
export type DatabaseOrTransaction = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export { schema };
