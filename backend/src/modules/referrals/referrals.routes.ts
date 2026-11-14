import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";
import { getRequestId } from "../../core/errors.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import type { AccessService } from "../access/access.service.js";
import { authLocals, contextOf, requireAuth } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SettingsRepository } from "../settings/settings.js";
import type { ReferralService } from "./referrals.service.js";

interface Deps {
  auth: AuthService;
  cookie: SessionCookieConfig;
  referrals: ReferralService;
  access: AccessService;
  settings: SettingsRepository;
  /** For the public visit counter (per IP, generous). */
  visitLimiter: RequestHandler;
  /** For code redemption (tight: it is a guessing target). */
  redeemLimiter: RequestHandler;
}

export function createReferralsRouter({
  auth,
  cookie,
  referrals,
  access,
  settings,
  visitLimiter,
  redeemLimiter,
}: Deps): Router {
  const router = Router();
  const required = requireAuth(auth, cookie);

  /** Public site switches the web app needs before anyone signs in. Same for everyone, so it may be cached. */
  router.get("/site", async (_req, res) => {
    const { settings: s } = await settings.get();
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({
      registrationOpen: s.registration.open,
      referralEnabled: s.referral.enabled,
      announcement:
        s.announcement.enabled && s.announcement.message !== "" ? s.announcement.message : null,
    });
  });

  router.get("/referrals/me", required, async (_req, res) => {
    res.json(await referrals.myStatus(authLocals(res).user.id));
  });

  /** POST (not GET) so link previews and prefetchers do not count as visits. Always answers the same. */
  router.post("/referrals/visit", visitLimiter, async (req, res) => {
    const { code } = z.strictObject({ code: z.string().trim().max(20) }).parse(req.body);
    await referrals.recordVisit(code, contextOf(req, getRequestId(res)));
    res.status(204).end();
  });

  router.post("/unlock/redeem", required, redeemLimiter, async (req, res) => {
    const { code } = z.strictObject({ code: z.string().trim().min(4).max(24) }).parse(req.body);
    const { user } = authLocals(res);
    await access.redeem(user.id, code, contextOf(req, getRequestId(res)));
    res.json({ status: "unlocked" });
  });

  return router;
}
