import type { Request, RequestHandler, Response } from "express";
import { Router } from "express";
import { AppError, getRequestId, notFound } from "../../core/errors.js";
import { readCookie, setSessionCookie } from "../../core/http/cookies.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import {
  CSRF_HEADER,
  CSRF_VALUE,
  authLocals,
  contextOf,
  requireAuth,
} from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import { PROVIDER_LABEL } from "./oauth.types.js";
import { codeSchema, completeSchema, providerParam } from "./oauth.schema.js";
import { SIGNUP_COOKIE, STATE_COOKIE } from "./oauth.service.js";
import type { OAuthService } from "./oauth.service.js";

interface Deps {
  auth: AuthService;
  oauth: OAuthService;
  cookie: SessionCookieConfig;
  /** Where the website lives: people are sent back here after the provider. */
  webBaseUrl: string;
  production: boolean;
  limiter: RequestHandler;
  /** Emergency switch from settings: false pauses new sign-ups, social ones included. */
  registrationOpen?: () => Promise<boolean>;
}

const PATH = "/api/v1/auth/oauth";

/** Reads a sealed cookie value. These are longer than session ids, so the session-cookie reader cannot be used. */
function readSealed(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/**
 * `/api/v1/auth/oauth/...`. The browser is sent to the provider with a sealed state cookie, comes back
 * to the callback, and ends on the website. Everything the visitor can read from a failure is a fixed
 * code in the address (`/login?error=...`); text from a provider is never shown or stored.
 */
export function createOAuthRouter({
  auth,
  oauth,
  cookie,
  webBaseUrl,
  production,
  limiter,
  registrationOpen,
}: Deps): Router {
  const router = Router();
  const web = (path: string): string => `${webBaseUrl.replace(/\/+$/, "")}${path}`;
  const stateName = production ? `__Secure-${STATE_COOKIE}` : STATE_COOKIE;
  const signupName = production ? `__Secure-${SIGNUP_COOKIE}` : SIGNUP_COOKIE;

  const options = (maxAgeMs: number) =>
    ({
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: PATH,
      maxAge: maxAgeMs,
    }) as const;
  const clear = (res: Response, name: string): void => {
    res.clearCookie(name, { httpOnly: true, secure: production, sameSite: "lax", path: PATH });
  };

  /** The signed-in person, if any, without failing the request. Used by the callback for "link". */
  async function optionalUser(req: Request, res: Response) {
    const token = readCookie(req, cookie.name);
    if (token === undefined) return null;
    const result = await auth.authenticate(token, contextOf(req, getRequestId(res)));
    return result?.user ?? null;
  }

  /** These routes use a cookie that the browser sends on its own, so a mutation must carry the custom header. */
  const requireHeader: RequestHandler = (req, _res, next) => {
    if (req.get(CSRF_HEADER) !== CSRF_VALUE) {
      return next(new AppError(403, "CSRF_HEADER_REQUIRED", "Missing required request header."));
    }
    next();
  };

  router.get("/providers", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ providers: oauth.enabled() });
  });

  // ----------------------------------------------------------------- start
  router.get("/:provider/start", limiter, (req, res) => {
    const provider = providerParam(req.params["provider"]);
    if (provider === null || !oauth.enabled().some((p) => p.id === provider)) throw notFound();
    const { url, cookie: state } = oauth.begin(provider, {
      intent: "signin",
      next: req.query["next"],
    });
    res.cookie(stateName, state, options(10 * 60_000));
    res.redirect(302, url);
  });

  /** Linking starts with a POST from a signed-in page, so another site cannot make someone link its account. */
  router.post("/:provider/link", limiter, requireAuth(auth, cookie), (req, res) => {
    const provider = providerParam(req.params["provider"]);
    if (provider === null || !oauth.enabled().some((p) => p.id === provider)) throw notFound();
    const { user } = authLocals(res);
    const { url, cookie: state } = oauth.begin(provider, { intent: "link", userId: user.id });
    res.cookie(stateName, state, options(10 * 60_000));
    res.json({ url });
  });

  // -------------------------------------------------------------- callback
  router.get("/:provider/callback", limiter, async (req, res) => {
    const provider = providerParam(req.params["provider"]);
    // The state cookie is single use: remove it whatever happens next.
    const stateCookie = readSealed(req, stateName);
    clear(res, stateName);
    if (provider === null) {
      res.redirect(302, web("/login?error=oauth_failed"));
      return;
    }
    const ctx = contextOf(req, getRequestId(res));
    let result;
    try {
      result = await oauth.callback(
        provider,
        { code: req.query["code"], state: req.query["state"], error: req.query["error"] },
        stateCookie,
        await optionalUser(req, res),
        ctx,
      );
    } catch {
      res.redirect(302, web("/login?error=oauth_unavailable"));
      return;
    }

    switch (result.kind) {
      case "signed_in":
        setSessionCookie(res, cookie, result.login.token, result.login.maxAgeSeconds);
        res.redirect(302, web(result.next));
        return;
      case "linked":
        res.redirect(302, web(`/account?connected=${result.provider}`));
        return;
      case "signup":
        if (registrationOpen !== undefined && !(await registrationOpen())) {
          res.redirect(302, web("/login?error=oauth_paused"));
          return;
        }
        res.cookie(signupName, result.cookie, options(15 * 60_000));
        res.redirect(302, web("/auth/complete"));
        return;
      case "error":
        res.redirect(
          302,
          web(
            result.intent === "link"
              ? `/account?oauth_error=${result.code}`
              : `/login?error=oauth_${result.code}&provider=${provider}`,
          ),
        );
    }
  });

  // ------------------------------------------------ finishing a new sign-up
  router.get("/pending", (req, res) => {
    const info = oauth.pending(readSealed(req, signupName));
    res.setHeader("Cache-Control", "no-store");
    res.json({ pending: info });
  });

  const finish = (
    req: Request,
    res: Response,
    outcome: Awaited<ReturnType<OAuthService["completeSignup"]>>,
  ): void => {
    if (outcome.kind === "code_sent") {
      res.cookie(signupName, outcome.cookie, options(15 * 60_000));
      res.status(202).json({ status: "code_sent", email: outcome.email });
      return;
    }
    clear(res, signupName);
    if (outcome.kind === "guardian_pending") {
      res.status(202).json({ status: "guardian_pending" });
      return;
    }
    setSessionCookie(res, cookie, outcome.login.token, outcome.login.maxAgeSeconds);
    res.status(201).json({ status: "signed_in" });
    void req;
  };

  router.post("/complete", limiter, requireHeader, async (req, res) => {
    if (registrationOpen !== undefined && !(await registrationOpen())) {
      throw new AppError(
        503,
        "REGISTRATION_CLOSED",
        "New sign-ups are paused for a short while. Please try again later.",
      );
    }
    const input = completeSchema.parse(req.body);
    const outcome = await oauth.completeSignup(
      readSealed(req, signupName),
      {
        ageBracket: input.ageBracket,
        guardianEmail: input.guardianEmail,
        privacyNoticeVersion: input.privacyNoticeVersion,
        referralCode: input.referralCode,
      },
      contextOf(req, getRequestId(res)),
    );
    finish(req, res, outcome);
  });

  router.post("/confirm-code", limiter, requireHeader, async (req, res) => {
    const { code } = codeSchema.parse(req.body);
    const outcome = await oauth.confirmCode(
      readSealed(req, signupName),
      code,
      contextOf(req, getRequestId(res)),
    );
    finish(req, res, outcome);
  });

  // ----------------------------------------------------- connected accounts
  router.get("/identities", requireAuth(auth, cookie), async (_req, res) => {
    const { user } = authLocals(res);
    const { identities, canRemoveAll } = await oauth.list(user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      hasPassword: canRemoveAll,
      identities: identities.map((i) => ({
        provider: i.provider,
        label: PROVIDER_LABEL[i.provider],
        email: i.email,
        connectedAt: i.createdAt.toISOString(),
      })),
    });
  });

  router.delete("/identities/:provider", requireAuth(auth, cookie), async (req, res) => {
    const provider = providerParam(req.params["provider"]);
    if (provider === null) throw notFound();
    await oauth.unlink(authLocals(res).user, provider, contextOf(req, getRequestId(res)));
    res.status(204).end();
  });

  return router;
}
