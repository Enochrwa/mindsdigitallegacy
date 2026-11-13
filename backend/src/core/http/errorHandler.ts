import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, buildErrorBody, notFound } from "../errors.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound());
};

interface HttpLikeError {
  status: number;
  type?: string;
}

/** body-parser and similar libraries throw errors with a numeric `status`. */
function isHttpLikeError(err: unknown): err is HttpLikeError {
  return (
    typeof err === "object" && err !== null && "status" in err && typeof err.status === "number"
  );
}

/**
 * Last middleware. Maps known errors to safe responses. Unknown errors become a generic 500;
 * the real error (with stack) goes to the server log only. Library error messages are never
 * forwarded to clients because they can contain fragments of the request body.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(buildErrorBody(res, err.code, err.message, err.details));
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    res
      .status(400)
      .json(buildErrorBody(res, "VALIDATION_ERROR", "Some fields are invalid.", details));
    return;
  }

  if (isHttpLikeError(err) && err.status >= 400 && err.status < 500) {
    if (err.status === 413) {
      res.status(413).json(buildErrorBody(res, "PAYLOAD_TOO_LARGE", "Request body is too large."));
    } else if (err.status === 415) {
      res
        .status(415)
        .json(buildErrorBody(res, "UNSUPPORTED_MEDIA_TYPE", "Unsupported content type."));
    } else if (err.type === "entity.parse.failed") {
      res.status(400).json(buildErrorBody(res, "INVALID_JSON", "Request body is not valid JSON."));
    } else {
      res.status(400).json(buildErrorBody(res, "BAD_REQUEST", "Bad request."));
    }
    return;
  }

  req.log.error({ err }, "unhandled error");
  res.status(500).json(buildErrorBody(res, "INTERNAL_ERROR", "Something went wrong."));
};
