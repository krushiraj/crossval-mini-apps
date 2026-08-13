"use client";

// Turns the server's error response back into a thrown ApiError, so a form can
// show the message against the right field instead of a generic failure.

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get fieldErrors(): Record<string, string> | undefined {
    const fields = this.details?.fields;
    return fields && typeof fields === "object" ? (fields as Record<string, string>) : undefined;
  }
}

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | null;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? "UNKNOWN",
      envelope?.error?.message ?? "The request failed. Please try again.",
      envelope?.error?.details,
    );
  }

  return payload as T;
};

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}), headers }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export const newIdempotencyKey = (): string => {
  return crypto.randomUUID();
};
