import type { RequestHandler } from "express";
import { AppError } from "../errors.js";

/**
 * Rejects request bodies that contain keys used for NoSQL operator injection ($ne, $gt, $where ...),
 * dotted-path injection (a.b), or prototype pollution (__proto__, constructor, prototype).
 *
 * Why a custom check: `express-mongo-sanitize` and `hpp` mutate `req.query`, which is read-only in
 * Express 5, so they cannot be used as-is. Strict Zod schemas remain the primary defence; this is a
 * second layer that also bounds depth and size so a hostile body cannot burn CPU.
 */

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_DEPTH = 6;
const MAX_NODES = 500;

export type UnsafeReason = "forbidden_key" | "too_deep" | "too_large";

export function findUnsafeStructure(root: unknown): UnsafeReason | null {
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const { value, depth } = current;
    if (typeof value !== "object" || value === null) continue;
    if (depth > MAX_DEPTH) return "too_deep";
    const entries: [string, unknown][] = Array.isArray(value)
      ? value.map((item, index): [string, unknown] => [String(index), item])
      : Object.entries(value);
    for (const [key, child] of entries) {
      nodes += 1;
      if (nodes > MAX_NODES) return "too_large";
      if (!Array.isArray(value)) {
        if (FORBIDDEN_KEYS.has(key) || key.startsWith("$") || key.includes(".")) {
          return "forbidden_key";
        }
      }
      stack.push({ value: child, depth: depth + 1 });
    }
  }
  return null;
}

export const rejectUnsafeKeys: RequestHandler = (req, _res, next) => {
  const reason = findUnsafeStructure(req.body);
  if (reason !== null) {
    // The offending key or value is intentionally not echoed back or logged.
    return next(new AppError(400, "INVALID_REQUEST", "Request body is not acceptable."));
  }
  next();
};
