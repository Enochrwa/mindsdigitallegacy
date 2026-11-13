import express from "express";
import type { Express } from "express";
import { pinoHttp } from "pino-http";
import type { Env } from "./config/env.js";
import type { Logger } from "./core/logger.js";
import { errorHandler, notFoundHandler } from "./core/http/errorHandler.js";
import { createLimiter } from "./core/http/rateLimit.js";
import { rejectUnsafeKeys } from "./core/http/rejectUnsafeKeys.js";
import { requestId } from "./core/http/requestId.js";
import { requireJson } from "./core/http/requireJson.js";
import { corsPolicy, noStore, originGuard, securityHeaders } from "./core/http/security.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { createLeadsRouter } from "./modules/leads/leads.routes.js";
import { createLeadService } from "./modules/leads/leads.service.js";
import type { LeadRepository } from "./modules/leads/leads.repository.js";

export interface AppDeps {
  env: Env;
  logger: Logger;
  leadRepository: LeadRepository;
  isDbReady: () => boolean;
}

/**
 * Builds the Express app from explicit dependencies (no globals), so tests can run the real
 * middleware stack against fakes. Order matters and is part of the security design:
 *
 *  1. request id, structured logging
 *  2. security headers, CORS, no-store
 *  3. health endpoints (before rate limiting, so orchestrator probes are never throttled)
 *  4. global rate limit, then origin check (CSRF defence in depth)
 *  5. content-type check, size-limited JSON parser, unsafe-key rejection
 *  6. routes, then 404 and the central error handler
 */
export function createApp({ env, logger, leadRepository, isDbReady }: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.set("query parser", "simple"); // no nested objects in query strings (Express 5 default, made explicit)
  app.set("etag", false);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => String(res.getHeader("X-Request-Id")),
      autoLogging: { ignore: (req) => req.url === "/api/v1/health" || req.url === "/api/v1/ready" },
      customLogLevel: (_req, res, err) => {
        if (err !== undefined || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      // Log method and path only: never the query string, headers or body.
      serializers: {
        req: (req: { id?: unknown; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(securityHeaders(env));
  app.use(corsPolicy(env.CORS_ORIGINS));
  app.use(noStore);

  app.use("/api/v1", createHealthRouter({ isDbReady }));

  app.use(createLimiter({ windowMs: 60_000, limit: env.RATE_LIMIT_GENERAL_PER_MINUTE }));
  app.use(originGuard(env.CORS_ORIGINS));
  app.use(requireJson);
  app.use(express.json({ limit: `${env.BODY_LIMIT_KB}kb`, strict: true }));
  app.use(rejectUnsafeKeys);

  const leadService = createLeadService({
    repository: leadRepository,
    retentionDays: env.LEAD_RETENTION_DAYS,
  });
  app.use(
    "/api/v1/leads",
    createLeadsRouter({
      service: leadService,
      limiter: createLimiter({ windowMs: 60 * 60_000, limit: env.RATE_LIMIT_LEADS_PER_HOUR }),
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
