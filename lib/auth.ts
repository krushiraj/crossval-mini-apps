import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db, schema } from "@/lib/db";

// One Better Auth instance shared by all three apps: a user signs up once and
// their session is valid across /pricing, /orders and /planner.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Take-home scope: no email delivery is wired up, so verification is off.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  secret: process.env.BETTER_AUTH_SECRET ?? "development-only-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
