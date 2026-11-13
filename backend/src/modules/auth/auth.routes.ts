import { Router } from "express";
import type { RequestHandler } from "express";
import { getRequestId } from "../../core/errors.js";
import { clearSessionCookie, setSessionCookie } from "../../core/http/cookies.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import { authLocals, contextOf, requireAuth } from "./auth.middleware.js";
import {
  forgotSchema,
  loginSchema,
  registerSchema,
  resetSchema,
  tokenSchema,
} from "./auth.schema.js";
import type { AuthService } from "./auth.service.js";

interface Deps {
  auth: AuthService;
  cookie: SessionCookieConfig;
  limiter: RequestHandler;
}

export function createAuthRouter({ auth, cookie, limiter }: Deps): Router {
  const router = Router();
  const ctx = (req: Parameters<typeof contextOf>[0], res: Parameters<typeof getRequestId>[0]) =>
    contextOf(req, getRequestId(res));

  // Same response whether or not the address was already registered.
  router.post("/register", limiter, async (req, res) => {
    await auth.register(registerSchema.parse(req.body), ctx(req, res));
    res.status(202).json({
      status: "check_your_email",
      message: "If this address can be registered, we have sent a verification link.",
    });
  });

  router.post("/verify-email", limiter, async (req, res) => {
    await auth.verifyEmail(tokenSchema.parse(req.body).token, ctx(req, res));
    res.json({ status: "verified" });
  });

  router.post("/guardian/confirm", limiter, async (req, res) => {
    await auth.confirmGuardian(tokenSchema.parse(req.body).token, ctx(req, res));
    res.json({ status: "guardian_consent_recorded" });
  });

  router.post("/login", limiter, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await auth.login(input.email, input.password, ctx(req, res));
    setSessionCookie(res, cookie, result.token, result.maxAgeSeconds);
    res.json({ status: "signed_in" });
  });

  router.post("/logout", requireAuth(auth, cookie), async (req, res) => {
    const { user, sessionToken } = authLocals(res);
    await auth.logout(sessionToken, user.id, ctx(req, res));
    clearSessionCookie(res, cookie);
    res.status(204).end();
  });

  router.post("/password/forgot", limiter, async (req, res) => {
    await auth.requestPasswordReset(forgotSchema.parse(req.body).email, ctx(req, res));
    res.status(202).json({
      status: "check_your_email",
      message: "If an account exists for this address, we have sent a reset link.",
    });
  });

  router.post("/password/reset", limiter, async (req, res) => {
    const input = resetSchema.parse(req.body);
    await auth.resetPassword(input.token, input.password, ctx(req, res));
    res.json({ status: "password_updated" });
  });

  return router;
}
