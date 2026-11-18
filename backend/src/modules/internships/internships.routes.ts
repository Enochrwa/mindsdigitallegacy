import type { RequestHandler } from "express";
import { Router } from "express";
import { AppError, getRequestId } from "../../core/errors.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import { authLocals, contextOf, requireAuth } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import { can } from "../auth/permissions.js";
import {
  applicantApplicationDto,
  applicantPlacementDto,
  publicPostingDto,
  supervisorPlacementDto,
} from "./internships.dto.js";
import {
  acceptSchema,
  applySchema,
  feedbackSchema,
  idParam,
  slugParam,
} from "./internships.schema.js";
import type { InternshipService } from "./internships.service.js";

interface Deps {
  auth: AuthService;
  cookie: SessionCookieConfig;
  internships: InternshipService;
  /** Tight: applying writes data and sends an email. */
  applyLimiter: RequestHandler;
  writeLimiter: RequestHandler;
}

/**
 * Public postings, the applicant's own pages, and the supervisor's pages. Everything an applicant can
 * reach is filtered by the signed-in user id in the service, so one person can never read another's data.
 */
export function createInternshipsRouter({
  auth,
  cookie,
  internships,
  applyLimiter,
  writeLimiter,
}: Deps): Router {
  const router = Router();
  const required = requireAuth(auth, cookie);

  // -------------------------------------------------------------- public
  router.get("/internships", async (_req, res) => {
    const items = await internships.listPublic();
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({ items: items.map(publicPostingDto) });
  });

  // ---------------------------------------------------- applicant (signed in)
  // These fixed paths are registered before "/internships/:slug"; their slugs are reserved.
  router.get("/internships/applications/me", required, async (_req, res) => {
    const rows = await internships.myApplications(authLocals(res).user.id);
    res.json({ items: rows.map((r) => applicantApplicationDto(r.application, r.posting)) });
  });

  router.get("/internships/applications/:id", required, async (req, res) => {
    const { application, posting } = await internships.myApplication(
      authLocals(res).user.id,
      idParam.parse(req.params["id"]),
    );
    res.json({ application: applicantApplicationDto(application, posting) });
  });

  router.post(
    "/internships/applications/:id/withdraw",
    required,
    writeLimiter,
    async (req, res) => {
      const { user } = authLocals(res);
      const updated = await internships.withdraw(
        user,
        idParam.parse(req.params["id"]),
        contextOf(req, getRequestId(res)),
      );
      const { posting } = await internships.myApplication(user.id, updated.id);
      res.json({ application: applicantApplicationDto(updated, posting) });
    },
  );

  router.post("/internships/applications/:id/accept", required, writeLimiter, async (req, res) => {
    const { user } = authLocals(res);
    const body = acceptSchema.parse(req.body);
    const updated = await internships.accept(
      user,
      idParam.parse(req.params["id"]),
      body.agreementVersion,
      contextOf(req, getRequestId(res)),
    );
    const { posting } = await internships.myApplication(user.id, updated.id);
    res.json({ application: applicantApplicationDto(updated, posting) });
  });

  router.get("/internships/placements/me", required, async (_req, res) => {
    const rows = await internships.myPlacements(authLocals(res).user.id);
    res.json({
      items: rows.map((r) => applicantPlacementDto(r.placement, r.posting, r.supervisor)),
    });
  });

  // --------------------------------------------------------- public posting
  router.get("/internships/:slug", async (req, res) => {
    const posting = await internships.getPublic(slugParam.parse(req.params["slug"]));
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({ posting: publicPostingDto(posting) });
  });

  /** Idempotent: a repeat submission returns the first application (200) instead of creating another (201). */
  router.post("/internships/:slug/apply", required, applyLimiter, async (req, res) => {
    const { user } = authLocals(res);
    const body = applySchema.parse(req.body);
    const { application, created, posting } = await internships.apply(
      user,
      slugParam.parse(req.params["slug"]),
      {
        statement: body.statement,
        links: body.links,
        availableFrom: body.availableFrom,
        under18: body.under18,
        guardian: body.guardian,
        privacyNoticeVersion: body.privacyNoticeVersion,
      },
      contextOf(req, getRequestId(res)),
    );
    res
      .status(created ? 201 : 200)
      .json({ application: applicantApplicationDto(application, posting) });
  });

  // ------------------------------------------------------------- supervisor
  const supervisorOnly: RequestHandler = (_req, res, next) => {
    if (!can(authLocals(res).user.roles, "internships:supervise")) {
      return next(new AppError(403, "FORBIDDEN", "You are not allowed to do that."));
    }
    next();
  };

  router.get("/supervisor/placements", required, supervisorOnly, async (_req, res) => {
    const rows = await internships.supervisorPlacements(authLocals(res).user.id);
    res.json({ items: rows.map((r) => supervisorPlacementDto(r.placement, r.posting, r.intern)) });
  });

  router.post(
    "/supervisor/placements/:id/feedback",
    required,
    supervisorOnly,
    writeLimiter,
    async (req, res) => {
      const { user } = authLocals(res);
      const body = feedbackSchema.parse(req.body);
      const updated = await internships.addFeedback(
        user,
        idParam.parse(req.params["id"]),
        body,
        contextOf(req, getRequestId(res)),
      );
      const rows = await internships.supervisorPlacements(user.id);
      const row = rows.find((r) => r.placement.id === updated.id);
      res.status(201).json({
        placement: row ? supervisorPlacementDto(row.placement, row.posting, row.intern) : null,
      });
    },
  );

  return router;
}
