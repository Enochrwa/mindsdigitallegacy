import type { RequestHandler, Request, Response } from "express";
import { AppError, getRequestId } from "../../core/errors.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import { ipPrefix } from "../../core/security/tokens.js";
import type { AccessService } from "../access/access.service.js";
import type { EntitlementRepository, UnlockCodeRepository } from "../access/access.types.js";
import type { AuditAction, AuditLog, AuditMeta } from "../audit/audit.js";
import { authLocals, contextOf, requireAuth } from "../auth/auth.middleware.js";
import type { AuthService, RequestContext } from "../auth/auth.service.js";
import { can } from "../auth/permissions.js";
import type { Permission } from "../auth/permissions.js";
import type { CatalogueAdminRepository } from "../courses/courses.admin.js";
import type {
  CatalogueRepository,
  EnrolmentRepository,
  ProgressRepository,
} from "../courses/courses.repository.js";
import type { InternshipService } from "../internships/internships.service.js";
import type { LeadAdminRepository } from "../leads/leads.admin.js";
import type { ReferralRepository } from "../referrals/referrals.repository.js";
import type { ReferralService } from "../referrals/referrals.service.js";
import type { SettingsRepository } from "../settings/settings.js";
import type { SessionRepository } from "../sessions/sessions.types.js";
import type { UserRepository } from "../users/users.repository.js";
import type { User } from "../users/users.types.js";
import type { SecretBox } from "./totp.js";

/** Staff must have passed the second factor within this window. Matches the admin session idle limit. */
export const MFA_FRESH_MS = 12 * 60 * 60 * 1000;

export interface AdminDeps {
  auth: AuthService;
  cookie: SessionCookieConfig;
  users: UserRepository;
  sessions: SessionRepository;
  audit: AuditLog;
  catalogue: CatalogueRepository;
  catalogueAdmin: CatalogueAdminRepository;
  enrolments: EnrolmentRepository;
  progress: ProgressRepository;
  leads: LeadAdminRepository;
  referrals: ReferralRepository;
  referralService: ReferralService;
  internships: InternshipService;
  access: AccessService;
  entitlements: EntitlementRepository;
  unlockCodes: UnlockCodeRepository;
  settings: SettingsRepository;
  secretBox: SecretBox;
  /** Tight limiter for second-factor and other brute-forceable staff endpoints. */
  strictLimiter: RequestHandler;
  now: () => Date;
}

/** What every admin handler needs: who is acting, and a one-line way to audit what they did. */
export interface Actor {
  user: User;
  ctx: RequestContext;
  record(action: AuditAction, meta: AuditMeta): Promise<void>;
}

export function actorOf(
  deps: Pick<AdminDeps, "audit" | "now">,
  req: Request,
  res: Response,
): Actor {
  const { user } = authLocals(res);
  const ctx = contextOf(req, getRequestId(res));
  return {
    user,
    ctx,
    record: (action, meta) =>
      deps.audit.append({
        at: deps.now(),
        actorId: user.id,
        action,
        requestId: ctx.requestId,
        ipPrefix: ipPrefix(ctx.ip),
        outcome: "success",
        meta,
      }),
  };
}

/**
 * Two layers in front of every admin route:
 *  1. a signed-in session with staff rights (`admin:access`);
 *  2. a fresh second factor, and the specific permission the route needs.
 * Routes pick `session` (MFA setup and verification only) or `with(permission)` (everything else).
 */
export function createStaffGuards(deps: Pick<AdminDeps, "auth" | "cookie" | "now">) {
  const required = requireAuth(deps.auth, deps.cookie);
  const staffOnly: RequestHandler = (_req, res, next) => {
    const { user } = authLocals(res);
    if (!can(user.roles, "admin:access"))
      return next(new AppError(403, "FORBIDDEN", "You are not allowed to do that."));
    next();
  };
  const mfaGate: RequestHandler = (_req, res, next) => {
    const { user, mfaVerifiedAt } = authLocals(res);
    if (user.totp?.enabledAt === undefined) {
      return next(
        new AppError(
          403,
          "MFA_SETUP_REQUIRED",
          "Set up two-step verification to use the admin console.",
        ),
      );
    }
    if (
      mfaVerifiedAt === undefined ||
      deps.now().getTime() - mfaVerifiedAt.getTime() > MFA_FRESH_MS
    ) {
      return next(new AppError(403, "MFA_REQUIRED", "Enter your verification code to continue."));
    }
    next();
  };
  const needs =
    (permission: Permission): RequestHandler =>
    (_req, res, next) => {
      if (!can(authLocals(res).user.roles, permission)) {
        return next(new AppError(403, "FORBIDDEN", "You are not allowed to do that."));
      }
      next();
    };
  return {
    session: [required, staffOnly] as RequestHandler[],
    with: (permission: Permission): RequestHandler[] => [
      required,
      staffOnly,
      mfaGate,
      needs(permission),
    ],
  };
}
export type StaffGuards = ReturnType<typeof createStaffGuards>;
