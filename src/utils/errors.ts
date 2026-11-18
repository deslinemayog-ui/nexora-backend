export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class TenantIsolationError extends AppError {
  constructor(message = 'Cross-tenant resource access violation') {
    super(message, 403, 'TENANT_ISOLATION_VIOLATION');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(
      identifier ? `${resource} (${identifier}) not found` : `${resource} not found`,
      404,
      'NOT_FOUND',
    );
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class OpenClawError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, 'OPENCLAW_EXECUTION_ERROR', details);
  }
}

export class WhatsAppError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, 'WHATSAPP_GATEWAY_ERROR', details);
  }
}
