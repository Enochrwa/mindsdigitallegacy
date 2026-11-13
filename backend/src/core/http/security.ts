import cors from "cors";
import helmet from "helmet";
import type { RequestHandler } from "express";
import type { Env } from "../../config/env.js";
import { forbiddenOrigin } from "../errors.js";

/**
 * Security headers for a JSON-only API. The API never serves HTML, so the CSP forbids everything
 * and framing is denied. (The web app sets its own CSP, including YouTube frame-src; see ADR-0005.)
 */
export function securityHeaders(env: Pick<Env, "NODE_ENV">): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-site" },
    // HSTS only over real HTTPS. No preload: preload is a long-lived commitment to decide later.
    strictTransportSecurity:
      env.NODE_ENV === "production" ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
}

/** Exact-match allow-list. Requests without an Origin header (curl, server-to-server) get no CORS headers. */
export function corsPolicy(allowedOrigins: readonly string[]): RequestHandler {
  return cors({
    origin(origin, callback) {
      callback(null, origin !== undefined && allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Requested-With", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
}

/** API responses are never cacheable by shared caches or browsers. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth. State-changing requests that carry an Origin header must come from an
 * allowed origin. Browsers always send Origin on cross-site POSTs, and the literal value "null"
 * (sandboxed frames, some redirects) is rejected because it is never in the allow-list.
 * Authenticated routes will additionally require the header (Sprint 1, ADR-0004).
 */
export function originGuard(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin)) return next(forbiddenOrigin());
    next();
  };
}
