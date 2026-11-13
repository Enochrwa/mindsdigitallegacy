import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import { buildErrorBody } from "../errors.js";

interface LimiterOptions {
  windowMs: number;
  limit: number;
}

/**
 * Per-client rate limiter with the standard `RateLimit` headers. The store is in memory, which is
 * correct for a single instance. Before running more than one API instance, move to a shared store
 * (Redis) or the limits are per-instance and easy to bypass.
 *
 * Caveat: mobile carriers in Rwanda may put many users behind one IP (CGNAT), so limits on public
 * forms are deliberately generous and rely on validation and the honeypot for abuse control.
 */
export function createLimiter({ windowMs, limit }: LimiterOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json(buildErrorBody(res, "RATE_LIMITED", "Too many requests. Please try again later."));
    },
  });
}
