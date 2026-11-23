import type { Request, RequestHandler, Response } from "express";
import { Router } from "express";
import { AppError, getRequestId } from "../../core/errors.js";
import { readCookie } from "../../core/http/cookies.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import { authLocals, contextOf, requireAuth } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import { can } from "../auth/permissions.js";
import {
  applicantApplicationDto,
  applicantPlacementDto,
  postingViewDto,
  supervisorPlacementDto,
} from "./internships.dto.js";
import {
  acceptSchema,
  alertSchema,
  applySchema,
  draftSchema,
  feedbackSchema,
  idParam,
  profileSchema,
  searchQuerySchema,
  slugParam,
} from "./internships.schema.js";
import type { ExtrasService } from "./internships.extras.service.js";
import type { InternshipService } from "./internships.service.js";

interface Deps {
  auth: AuthService;
  cookie: SessionCookieConfig;
  internships: InternshipService;
  /** Search, saved internships, profile, drafts and alerts. */
  extras: ExtrasService;
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
  extras,
  applyLimiter,
  writeLimiter,
}: Deps): Router {
  const router = Router();
  const required = requireAuth(auth, cookie);

  // -------------------------------------------------------------- public
  /** The signed-in person if there is one, without failing the request: public pages personalise when they can. */
  async function viewer(req: Request, res: Response) {
    const token = readCookie(req, cookie.name);
    if (token === undefined) return null;
    const found = await auth.authenticate(token, contextOf(req, getRequestId(res)));
    return found?.user ?? null;
  }
  // Answers differ per person (saved, match), so only the browser may keep them, briefly.
  const personal = (res: Response): void => {
    res.setHeader("Cache-Control", "private, max-age=15");
    res.setHeader("Vary", "Cookie");
  };

  /** Search with filters, sorting and paging. Query: q, department, mode, compensation, maxWeeks, sort, page... */
  router.get("/internships", async (req, res) => {
    const q = searchQuerySchema.parse(req.query);
    const result = await extras.search(q, await viewer(req, res));
    personal(res);
    res.json({
      items: result.items.map(postingViewDto),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      facets: result.facets,
      sort: result.sort,
    });
  });

  router.get("/internships/saved", required, async (_req, res) => {
    const rows = await extras.listSaved(authLocals(res).user);
    res.setHeader("Cache-Control", "no-store");
    res.json({ items: rows.map((r) => ({ ...postingViewDto(r), open: r.open })) });
  });

  // ---- reusable profile ("apply once, reuse everywhere"), alerts
  router.get("/internships/profile/me", required, async (_req, res) => {
    const profile = await extras.getProfile(authLocals(res).user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({ profile, complete: extras.isProfileComplete(profile) });
  });
  router.put("/internships/profile/me", required, writeLimiter, async (req, res) => {
    const profile = await extras.saveProfile(authLocals(res).user, profileSchema.parse(req.body));
    res.json({ profile, complete: extras.isProfileComplete(profile) });
  });
  router.delete("/internships/profile/me", required, writeLimiter, async (_req, res) => {
    await extras.deleteProfile(authLocals(res).user);
    res.status(204).end();
  });

  router.get("/internships/alerts/me", required, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ alert: await extras.getAlert(authLocals(res).user.id) });
  });
  router.put("/internships/alerts/me", required, writeLimiter, async (req, res) => {
    res.json({ alert: await extras.setAlert(authLocals(res).user, alertSchema.parse(req.body)) });
  });
  router.delete("/internships/alerts/me", required, writeLimiter, async (_req, res) => {
    await extras.deleteAlert(authLocals(res).user);
    res.status(204).end();
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
    const found = await extras.detail(slugParam.parse(req.params["slug"]), await viewer(req, res));
    personal(res);
    res.json({
      posting: postingViewDto(found),
      similar: found.similar.map(postingViewDto),
      applied: found.applied,
    });
  });

  /** "Can I apply?" before filling anything in: blockers, match, whether a draft or profile can help. */
  router.get("/internships/:slug/apply-check", async (req, res) => {
    const check = await extras.applyCheck(
      await viewer(req, res),
      slugParam.parse(req.params["slug"]),
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(check);
  });

  router.put("/internships/:slug/save", required, writeLimiter, async (req, res) => {
    await extras.save(authLocals(res).user, slugParam.parse(req.params["slug"]));
    res.status(204).end();
  });
  router.delete("/internships/:slug/save", required, writeLimiter, async (req, res) => {
    await extras.unsave(authLocals(res).user, slugParam.parse(req.params["slug"]));
    res.status(204).end();
  });

  // ---- drafts: saved while the person types, deleted when they apply
  router.get("/internships/:slug/draft", required, async (req, res) => {
    const draft = await extras.getDraft(authLocals(res).user, slugParam.parse(req.params["slug"]));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      draft:
        draft === null
          ? null
          : {
              statement: draft.statement,
              links: draft.links,
              answers: draft.answers,
              availableFrom: draft.availableFrom?.toISOString(),
              updatedAt: draft.updatedAt.toISOString(),
            },
    });
  });
  router.put("/internships/:slug/draft", required, writeLimiter, async (req, res) => {
    const body = draftSchema.parse(req.body);
    const draft = await extras.saveDraft(
      authLocals(res).user,
      slugParam.parse(req.params["slug"]),
      body,
    );
    res.json({ savedAt: draft.updatedAt.toISOString() });
  });
  router.delete("/internships/:slug/draft", required, writeLimiter, async (req, res) => {
    await extras.deleteDraft(authLocals(res).user, slugParam.parse(req.params["slug"]));
    res.status(204).end();
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
        answers: body.answers,
        useProfile: body.useProfile,
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
