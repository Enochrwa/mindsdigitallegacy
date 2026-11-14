import type { RequestHandler } from "express";
import { Router } from "express";
import { AppError } from "../../core/errors.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import { authLocals, contextOf, optionalAuth, requireAuth } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import { authorize } from "../auth/policy.js";
import type { User } from "../users/users.types.js";
import { getRequestId } from "../../core/errors.js";
import { catalogueQuerySchema, progressBodySchema, slugParam } from "./courses.schema.js";
import type { CoursesService } from "./courses.service.js";

interface Deps {
  auth: AuthService;
  courses: CoursesService;
  cookie: SessionCookieConfig;
  /** Applied to write routes (enrol, progress). */
  writeLimiter: RequestHandler;
}

/** The catalogue is identical for everyone, so browsers and a CDN may cache it briefly. */
const publicCache: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  next();
};

export function createCoursesRouter({ auth, courses, cookie, writeLimiter }: Deps): Router {
  const router = Router();
  const required = requireAuth(auth, cookie);
  const optional = optionalAuth(auth)(cookie);

  const guard = (user: User, action: "learning:read" | "learning:write"): void => {
    if (!authorize(user, action, { ownerId: user.id })) {
      throw new AppError(403, "FORBIDDEN", "You are not allowed to do that.");
    }
  };

  // ----- Public (no personal data, cacheable) -------------------------------------------------
  router.get("/courses", publicCache, async (req, res) => {
    const q = catalogueQuerySchema.parse(req.query);
    res.json(
      await courses.catalogue({
        ...(q.category === undefined ? {} : { categorySlug: q.category }),
        ...(q.level === undefined ? {} : { level: q.level }),
        ...(q.language === undefined ? {} : { language: q.language }),
        ...(q.tag === undefined ? {} : { tag: q.tag }),
      }),
    );
  });

  router.get("/courses/:slug", publicCache, async (req, res) => {
    res.json({ course: await courses.courseDetail(slugParam.parse(req.params["slug"])) });
  });

  // ----- Personal (never cached; the global no-store header applies) --------------------------
  router.get("/learning", required, async (_req, res) => {
    const { user } = authLocals(res);
    guard(user, "learning:read");
    res.json({ items: await courses.myLearning(user.id) });
  });

  router.get("/courses/:slug/enrolment", required, async (req, res) => {
    const { user } = authLocals(res);
    guard(user, "learning:read");
    res.json({
      enrolment: await courses.myEnrolment(user.id, slugParam.parse(req.params["slug"])),
    });
  });

  router.post("/courses/:slug/enrol", required, writeLimiter, async (req, res) => {
    const { user } = authLocals(res);
    guard(user, "learning:write");
    const ctx = contextOf(req, getRequestId(res));
    res
      .status(201)
      .json({ enrolment: await courses.enrol(user.id, slugParam.parse(req.params["slug"]), ctx) });
  });

  router.delete("/courses/:slug/enrol", required, writeLimiter, async (req, res) => {
    const { user } = authLocals(res);
    guard(user, "learning:write");
    await courses.withdraw(
      user.id,
      slugParam.parse(req.params["slug"]),
      contextOf(req, getRequestId(res)),
    );
    res.status(204).end();
  });

  /** Optional auth: free-preview lessons open to anyone; the service decides everything else. */
  router.get("/courses/:slug/lessons/:lessonSlug", optional, async (req, res) => {
    const user = res.locals["user"] as User | undefined;
    const lesson = await courses.lesson(
      user?.id,
      slugParam.parse(req.params["slug"]),
      slugParam.parse(req.params["lessonSlug"]),
    );
    res.json({ lesson });
  });

  router.put(
    "/courses/:slug/lessons/:lessonSlug/progress",
    required,
    writeLimiter,
    async (req, res) => {
      const { user } = authLocals(res);
      guard(user, "learning:write");
      const body = progressBodySchema.parse(req.body);
      const enrolment = await courses.saveProgress(
        user.id,
        slugParam.parse(req.params["slug"]),
        slugParam.parse(req.params["lessonSlug"]),
        body,
        contextOf(req, getRequestId(res)),
      );
      res.json({ enrolment });
    },
  );

  return router;
}
