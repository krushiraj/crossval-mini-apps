// The calculation modules throw these too, so a rule like "a fixed discount
// can't be bigger than the line" lives with the rule rather than in whichever
// route happens to call it. The API turns any of these into the same response
// shape and never lets anything else reach the browser.

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

// Also used when the row belongs to someone else. A 403 would confirm it
// exists, which tells them something about another account.
export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(404, "NOT_FOUND", message);
  }
}

// The request was fine, but a rule says no.
export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: ErrorDetails) {
    super(409, code, message, details);
  }
}
