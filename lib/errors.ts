// Error types shared by the calculation modules and the API layer.
//
// Calculation modules stay free of HTTP concerns but do carry a machine
// readable `code` and a human readable, actionable `message`; the API layer
// turns any AppError into the standard error envelope and never leaks
// anything else to the client.

export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toEnvelope() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

// Input the caller can fix by sending different values.
export class ValidationError extends AppError {
  constructor(code: string, message: string, details?: ErrorDetails) {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in to do that.") {
    super(401, "UNAUTHENTICATED", message);
  }
}

// Used both for genuinely missing rows and for rows owned by another user, so
// the API never reveals whether someone else's record exists.
export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(404, "NOT_FOUND", message);
  }
}

// The request was well formed but a business rule forbids it.
export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: ErrorDetails) {
    super(409, code, message, details);
  }
}
