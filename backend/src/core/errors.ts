import type { Response } from "express";

/**
 * Error model. Every error response has the same shape and never contains stack traces,
 * query text, or user-supplied values:
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "requestId": "..." } }
 */

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbiddenOrigin = (): AppError =>
  new AppError(403, "FORBIDDEN_ORIGIN", "Request origin is not allowed.");

export const unsupportedMediaType = (): AppError =>
  new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");

export const notFound = (): AppError => new AppError(404, "NOT_FOUND", "Resource not found.");

export function getRequestId(res: Response): string {
  const value: unknown = res.locals["requestId"];
  return typeof value === "string" ? value : "unknown";
}

export function buildErrorBody(
  res: Response,
  code: string,
  message: string,
  details?: unknown,
): ErrorBody {
  const body: ErrorBody = { error: { code, message, requestId: getRequestId(res) } };
  if (details !== undefined) body.error.details = details;
  return body;
}
