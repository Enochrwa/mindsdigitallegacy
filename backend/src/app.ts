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
import { createCspRouter } from "./modules/csp/csp.routes.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { createLeadsRouter } from "./modules/leads/leads.routes.js";
import { createLeadService } from "./modules/leads/leads.service.js";
import type { LeadRepository } from "./modules/leads/leads.repository.js";
import type { BreachChecker } from "./core/security/breach.js";
import type { PasswordHasher } from "./core/security/password.js";
import type { AuditLog } from "./modules/audit/audit.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import type { AuthTokenRepository } from "./modules/auth/authTokens.js";
import type { Mailer } from "./modules/auth/mailer.js";
import type { SessionRepository } from "./modules/sessions/sessions.types.js";
import { createCoursesRouter } from "./modules/courses/courses.routes.js";
import { createCoursesService } from "./modules/courses/courses.service.js";
import type {
  CatalogueRepository,
  EnrolmentRepository,
  ProgressRepository,
} from "./modules/courses/courses.repository.js";
import { createAccessService } from "./modules/access/access.service.js";
import type { EntitlementRepository, UnlockCodeRepository } from "./modules/access/access.types.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import { createSecretBox } from "./modules/admin/totp.js";
import type { CatalogueAdminRepository } from "./modules/courses/courses.admin.js";
import type { LeadAdminRepository } from "./modules/leads/leads.admin.js";
import {
  applicantApplicationDto,
  applicantPlacementDto,
} from "./modules/internships/internships.dto.js";
import { createInternshipsRouter } from "./modules/internships/internships.routes.js";
import { createInternshipService } from "./modules/internships/internships.service.js";
import type {
  ApplicationRepository,
  PlacementRepository,
  PostingRepository,
} from "./modules/internships/internships.repository.js";
import { createReferralsRouter } from "./modules/referrals/referrals.routes.js";
import { createReferralService } from "./modules/referrals/referrals.service.js";
import type { ReferralRepository } from "./modules/referrals/referrals.repository.js";
import type { SettingsRepository } from "./modules/settings/settings.js";
import { createUsersRouter } from "./modules/users/users.routes.js";
import type { UserRepository } from "./modules/users/users.repository.js";

export interface AppDeps {
  env: Env;
  logger: Logger;
  leadRepository: LeadRepository;
  users: UserRepository;
  sessions: SessionRepository;
  authTokens: AuthTokenRepository;
  audit: AuditLog;
  catalogue: CatalogueRepository;
  enrolments: EnrolmentRepository;
  progress: ProgressRepository;
  catalogueAdmin: CatalogueAdminRepository;
  leadAdmin: LeadAdminRepository;
  referrals: ReferralRepository;
  internshipPostings: PostingRepository;
  internshipApplications: ApplicationRepository;
  internshipPlacements: PlacementRepository;
  entitlements: EntitlementRepository;
  unlockCodes: UnlockCodeRepository;
  settings: SettingsRepository;
  mailer: Mailer;
  hasher: PasswordHasher;
  breach: BreachChecker;
  now?: () => Date;
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
export function createApp(deps: AppDeps): Express {
  const { env, logger, leadRepository, isDbReady } = deps;
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

  // Browser CSP reports: own parser, own tight limit, before the general guards (see csp.routes.ts).
  app.use(
    "/api/v1/csp-report",
    createCspRouter({
      logger,
      limiter: createLimiter({ windowMs: 60_000, limit: env.RATE_LIMIT_CSP_REPORTS_PER_MINUTE }),
    }),
  );

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

  const production = env.NODE_ENV === "production";
  // `__Host-` cookies must be Secure, so the prefix is used only where HTTPS is guaranteed.
  const cookie = { name: production ? "__Host-mdl_sid" : "mdl_sid", secure: production };
  const now = deps.now ?? ((): Date => new Date());
  const access = createAccessService({
    entitlements: deps.entitlements,
    unlockCodes: deps.unlockCodes,
    enrolments: deps.enrolments,
    catalogue: deps.catalogue,
    audit: deps.audit,
    now,
  });
  const referralService = createReferralService({
    referrals: deps.referrals,
    users: deps.users,
    settings: deps.settings,
    access,
    audit: deps.audit,
    now,
  });
  const auth = createAuthService({
    hooks: {
      registered: (user, code, ctx) => referralService.onRegistered(user, code, ctx),
      activated: (userId) => referralService.onActivated(userId),
    },
    users: deps.users,
    sessions: deps.sessions,
    tokens: deps.authTokens,
    audit: deps.audit,
    mailer: deps.mailer,
    hasher: deps.hasher,
    breach: deps.breach,
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      auth,
      cookie,
      limiter: createLimiter({ windowMs: 15 * 60_000, limit: env.RATE_LIMIT_AUTH_PER_15MIN }),
      registrationOpen: async () => (await deps.settings.get()).settings.registration.open,
    }),
  );
  app.use(
    "/api/v1",
    createReferralsRouter({
      auth,
      cookie,
      referrals: referralService,
      access,
      settings: deps.settings,
      visitLimiter: createLimiter({ windowMs: 60_000, limit: 60 }),
      redeemLimiter: createLimiter({ windowMs: 15 * 60_000, limit: 10 }),
    }),
  );
  const internships = createInternshipService({
    postings: deps.internshipPostings,
    applications: deps.internshipApplications,
    placements: deps.internshipPlacements,
    users: deps.users,
    audit: deps.audit,
    mailer: deps.mailer,
    perSupervisor: env.INTERNSHIP_MAX_PER_SUPERVISOR,
    now,
  });
  app.use(
    "/api/v1",
    createInternshipsRouter({
      auth,
      cookie,
      internships,
      applyLimiter: createLimiter({ windowMs: 60 * 60_000, limit: 10 }),
      writeLimiter: createLimiter({ windowMs: 60_000, limit: env.RATE_LIMIT_LEARNING_PER_MINUTE }),
    }),
  );
  const strictLimiter = createLimiter({ windowMs: 15 * 60_000, limit: 20 });
  app.use(
    "/api/v1/admin",
    createAdminRouter({
      auth,
      cookie,
      users: deps.users,
      sessions: deps.sessions,
      audit: deps.audit,
      catalogue: deps.catalogue,
      catalogueAdmin: deps.catalogueAdmin,
      enrolments: deps.enrolments,
      progress: deps.progress,
      leads: deps.leadAdmin,
      referrals: deps.referrals,
      referralService,
      internships,
      access,
      entitlements: deps.entitlements,
      unlockCodes: deps.unlockCodes,
      settings: deps.settings,
      secretBox: createSecretBox(
        env.TOTP_ENCRYPTION_KEY ?? "dev-only-insecure-totp-key-change-me!",
      ),
      strictLimiter,
      now,
    }),
  );
  const courses = createCoursesService({
    catalogue: deps.catalogue,
    enrolments: deps.enrolments,
    progress: deps.progress,
    audit: deps.audit,
    resolveAccess: (userId, courseId) => access.resolve(userId, courseId),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });
  app.use(
    "/api/v1",
    createCoursesRouter({
      auth,
      courses,
      cookie,
      writeLimiter: createLimiter({ windowMs: 60_000, limit: env.RATE_LIMIT_LEARNING_PER_MINUTE }),
    }),
  );
  app.use(
    "/api/v1/users",
    createUsersRouter({
      auth,
      users: deps.users,
      sessions: deps.sessions,
      audit: deps.audit,
      hasher: deps.hasher,
      cookie,
      exportLearning: (userId) => courses.exportLearning(userId),
      exportInternships: async (userId) => {
        const [apps, placed] = await Promise.all([
          internships.myApplications(userId),
          internships.myPlacements(userId),
        ]);
        // The applicant's own view: reviewer notes and scores are staff-only and never exported.
        return {
          applications: apps.map((r) => applicantApplicationDto(r.application, r.posting)),
          placements: placed.map((r) =>
            applicantPlacementDto(r.placement, r.posting, r.supervisor),
          ),
        };
      },
      ...(deps.now === undefined ? {} : { now: deps.now }),
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
