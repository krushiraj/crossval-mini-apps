// Every route: authenticate, validate, load and check ownership, check the
// rule, then write the change and its audit entry together.

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { ZodError, type ZodType } from "zod";

import { auth } from "@/lib/auth";
import type { DatabaseOrTransaction } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { AppError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { MoneyError } from "@/lib/money";

export const newId = (): string => {
  return nanoid();
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

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

// Reports every bad field at once, so the form can mark them all instead of
// making the user fix one per attempt.
export const validate = <T>(schema: ZodType<T>, data: unknown): T => {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
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
    }
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

// Lets a client retry safely after a timeout without paying twice.
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

  // Reaching here means validation let something through, but the caller still
  // gets a 400 rather than a 500 blaming us.
  if (error instanceof MoneyError) {
    const moneyError = new ValidationError("AMOUNT_OUT_OF_RANGE", error.message);
    return NextResponse.json(moneyError.toEnvelope(), { status: moneyError.status });
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

// Takes the transaction so the audit row commits with the change it describes.
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
