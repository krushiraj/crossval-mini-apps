import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

// With nothing set this uses a local file, so the app runs without a cloud
// account. Production points the same variable at Turso. Same client either
// way, so local and deployed can't behave differently.
const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const libsql = createClient({ url, authToken });

export const db = drizzle(libsql, { schema });

export type Database = typeof db;

export type DatabaseOrTransaction = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export { schema };
