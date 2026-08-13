// The contract every API route in this project follows:
//
//   auth -> validate -> load + ownership check -> business-rule guard ->
//   transaction (write + audit) -> return server-computed state
//
// Handlers throw `AppError` subclasses; `apiRoute` turns them into the single
// error envelope used across all three apps:
//
//   { "error": { "code": "...", "message": "...", "details": { ... } } }

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { ZodError, type ZodType } from "zod";

import { auth } from "@/lib/auth";
import type { DatabaseOrTransaction } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { AppError, UnauthorizedError, ValidationError } from "@/lib/errors";

export const newId = (): string => {
  return nanoid();
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

// Resolves the signed-in user or throws 401. Every mutating route calls this first.
export const requireUser = async (): Promise<AuthenticatedUser> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new UnauthorizedError();
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
};

// Validates input against a Zod schema and reports every failing field at once
// so the client can highlight all of them rather than one per round trip.
export const validate = <T>(schema: ZodType<T>, data: unknown): T => {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  };
  throw new ValidationError("VALIDATION_FAILED", summarizeIssues(result.error), {
    fields: fieldErrorsFrom(result.error),
  });
};

const fieldErrorsFrom = (error: ZodError): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    if (!fields[path]) {
      fields[path] = issue.message;
    };
  }
  return fields;
};

const summarizeIssues = (error: ZodError): string => {
  const [first] = error.issues;
  if (!first) return "The submitted data is invalid.";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
};

export const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("INVALID_JSON", "Request body must be valid JSON.");
  }
};

// Optional client-supplied key that makes a create request safe to retry.
export const idempotencyKeyFrom = (request: Request): string | null => {
  const key = request.headers.get("Idempotency-Key");
  return key && key.trim().length > 0 ? key.trim() : null;
};

export const ok = <T>(data: T): NextResponse => {
  return NextResponse.json(data as object, { status: 200 });
};

export const created = <T>(data: T): NextResponse => {
  return NextResponse.json(data as object, { status: 201 });
};

export const noContent = (): NextResponse => {
  return new NextResponse(null, { status: 204 });
};

export const toErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof AppError) {
    return NextResponse.json(error.toEnvelope(), { status: error.status });
  }

  if (error instanceof ZodError) {
    const validationError = new ValidationError("VALIDATION_FAILED", summarizeIssues(error), {
      fields: fieldErrorsFrom(error),
    });
    return NextResponse.json(validationError.toEnvelope(), { status: validationError.status });
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side." } },
    { status: 500 },
  );
};

type RouteHandler<Context> = (request: Request, context: Context) => Promise<Response>;

// Wraps a route handler so every thrown AppError becomes the standard envelope.
export const apiRoute = <Context>(handler: RouteHandler<Context>): RouteHandler<Context> => {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
};

export interface AuditEntry {
  userId: string;
  app: "pricing" | "orders" | "planner";
  entityType: string;
  entityId: string;
  action: string;
  detail?: Record<string, unknown>;
}

// Appends to the audit trail. Always call this with the *transaction* handle of
// the mutation being recorded, so the trail cannot drift from the data.
export const recordAudit = async (
  tx: DatabaseOrTransaction,
  entry: AuditEntry,
): Promise<void> => {
  await tx.insert(auditLog).values({
    id: newId(),
    userId: entry.userId,
    app: entry.app,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    detail: entry.detail ? JSON.stringify(entry.detail) : null,
  });
};
