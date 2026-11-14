import type { Request, RequestHandler } from "express";
import { AppError, getRequestId } from "../../core/errors.js";
import { clearSessionCookie, readCookie, setSessionCookie } from "../../core/http/cookies.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import type { AuthService, RequestContext } from "./auth.service.js";
import type { User } from "../users/users.types.js";

export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "mdl-web";

export function contextOf(req: Request, requestId: string): RequestContext {
  return { ip: req.ip, userAgent: req.get("user-agent"), requestId };
}

export interface AuthLocals {
  user: User;
  sessionToken: string;
}

/**
 * Loads the session from the cookie. Responds 401 (same body for every failure) when it is missing,
 * expired, revoked or reused. Mutating methods must also carry the custom header, which a cross-site
 * form or a simple cross-origin request cannot add (ADR-0004).
 */
export function requireAuth(auth: AuthService, cookie: SessionCookieConfig): RequestHandler {
  return async (req, res, next) => {
    try {
      const unauthenticated = new AppError(401, "UNAUTHENTICATED", "Please sign in.");
      const token = readCookie(req, cookie.name);
      if (token === undefined) throw unauthenticated;

      const isMutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (isMutation && req.get(CSRF_HEADER) !== CSRF_VALUE) {
        throw new AppError(403, "CSRF_HEADER_REQUIRED", "Missing required request header.");
      }

      const result = await auth.authenticate(token, contextOf(req, getRequestId(res)));
      if (result === null) {
        clearSessionCookie(res, cookie);
        throw unauthenticated;
      }
      if (result.rotated !== undefined) {
        setSessionCookie(res, cookie, result.rotated.token, result.rotated.maxAgeSeconds);
        res.locals["sessionToken"] = result.rotated.token;
      } else {
        res.locals["sessionToken"] = token;
      }
      res.locals["user"] = result.user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function authLocals(res: { locals: Record<string, unknown> }): AuthLocals {
  const user = res.locals["user"] as User | undefined;
  const sessionToken = res.locals["sessionToken"] as string | undefined;
  if (user === undefined || sessionToken === undefined) {
    throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");
  }
  return { user, sessionToken };
}

/**
 * Like requireAuth but never rejects: a missing or invalid session simply means "anonymous". Used by
 * public GET routes that show more to a signed-in learner (for example free-preview lessons).
 */
export function optionalAuth(auth: AuthService): (cookie: SessionCookieConfig) => RequestHandler {
  return (cookie) => async (req, res, next) => {
    try {
      const token = readCookie(req, cookie.name);
      if (token !== undefined) {
        const result = await auth.authenticate(token, contextOf(req, getRequestId(res)));
        if (result !== null) {
          if (result.rotated !== undefined) {
            setSessionCookie(res, cookie, result.rotated.token, result.rotated.maxAgeSeconds);
          }
          res.locals["user"] = result.user;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
