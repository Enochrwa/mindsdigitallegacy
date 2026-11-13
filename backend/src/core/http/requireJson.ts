import type { RequestHandler } from "express";
import { unsupportedMediaType } from "../errors.js";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * Only JSON bodies are accepted. This blocks cross-site HTML form posts
 * (application/x-www-form-urlencoded, multipart/form-data, text/plain), which cannot be sent
 * with a JSON content type without a CORS preflight, and avoids parser surprises.
 */
export const requireJson: RequestHandler = (req, _res, next) => {
  if (!BODY_METHODS.has(req.method)) return next();
  const contentLength = req.headers["content-length"];
  const hasBody =
    (contentLength !== undefined && contentLength !== "0") ||
    req.headers["transfer-encoding"] !== undefined;
  if (hasBody && !req.is("application/json")) return next(unsupportedMediaType());
  next();
};
