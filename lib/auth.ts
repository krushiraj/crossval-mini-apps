import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db, schema } from "@/lib/db";

// Vercel sets the host, so preview deployments work without per-branch config.
const resolveBaseUrl = (): string => {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
};

const baseURL = resolveBaseUrl();

// Requests from anywhere else are refused, which is what stops another site
// driving a signed-in session. Local development allows the ports Next.js
// falls back to when 3000 is taken.
const trustedOrigins =
  process.env.NODE_ENV === "production"
    ? [baseURL, "https://*.vercel.app"]
    : [baseURL, "http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"];

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
  baseURL,
  trustedOrigins,
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
