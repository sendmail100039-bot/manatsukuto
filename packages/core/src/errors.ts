export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

export class NotFoundError extends PlatformError {
  constructor(what: string) {
    super("NOT_FOUND", `${what} が見つかりません`, 404);
  }
}

export class ForbiddenError extends PlatformError {
  constructor(message = "この操作を行う権限がありません") {
    super("FORBIDDEN", message, 403);
  }
}

export class UnauthorizedError extends PlatformError {
  constructor(message = "ログインが必要です") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ValidationError extends PlatformError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION", message, 400, details);
  }
}

export class ConflictError extends PlatformError {
  constructor(message: string, details?: unknown) {
    super("CONFLICT", message, 409, details);
  }
}
