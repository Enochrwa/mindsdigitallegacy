import express, { Router } from "express";
import type { RequestHandler } from "express";
import type { Logger } from "../../core/logger.js";
import { createDeduper, parseReports } from "./csp.js";

interface Deps {
  logger: Logger;
  limiter: RequestHandler;
  /** Same finding is logged once per this many milliseconds. */
  dedupeMs?: number;
}

/**
 * `POST /api/v1/csp-report`. Always answers 204, whatever the body, so it reveals nothing and never
 * becomes an oracle. Content types are limited to the two the browsers send. It is mounted before the
 * origin and JSON guards because browsers send reports without CORS and with their own content type.
 */
export function createCspRouter({ logger, limiter, dedupeMs = 10 * 60_000 }: Deps): Router {
  const router = Router();
  const shouldLog = createDeduper(dedupeMs);

  router.post(
    "/",
    limiter,
    express.json({
      type: ["application/csp-report", "application/reports+json", "application/json"],
      limit: "16kb",
      strict: false,
    }),
    (req, res) => {
      for (const finding of parseReports(req.body as unknown)) {
        if (shouldLog(finding)) logger.warn({ csp: finding }, "csp violation report");
      }
      res.status(204).end();
    },
  );

  // A malformed or oversized body is still just a 204 for the sender; it only costs us the parse.
  // Express only treats a function as an error handler if it declares four parameters.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use(((_err, _req, res, _next) => {
    res.status(204).end();
  }) as express.ErrorRequestHandler);

  return router;
}
