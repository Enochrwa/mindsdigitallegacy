import { Router } from "express";
import { AppError, getRequestId } from "../../core/errors.js";
import type { SessionCookieConfig } from "../../core/http/cookies.js";
import { clearSessionCookie } from "../../core/http/cookies.js";
import type { PasswordHasher } from "../../core/security/password.js";
import { ipPrefix } from "../../core/security/tokens.js";
import type { AuditLog } from "../audit/audit.js";
import { authLocals, requireAuth } from "../auth/auth.middleware.js";
import { consentUpdateSchema, deleteAccountSchema } from "../auth/auth.schema.js";
import type { AuthService } from "../auth/auth.service.js";
import { authorize } from "../auth/policy.js";
import type { SessionRepository } from "../sessions/sessions.types.js";
import type { UserRepository } from "./users.repository.js";
import { hasPassword } from "./users.types.js";
import type { User } from "./users.types.js";

interface Deps {
  auth: AuthService;
  users: UserRepository;
  sessions: SessionRepository;
  audit: AuditLog;
  hasher: PasswordHasher;
  cookie: SessionCookieConfig;
  /** Adds learning data to the self-service export. */
  exportLearning?: (userId: string) => Promise<unknown>;
  /** Adds internship applications and placements (the applicant's own view) to the export. */
  exportInternships?: (userId: string) => Promise<unknown>;
  /** Adds the linked sign-in providers (which ones, and the email each showed). */
  exportSignInMethods?: (userId: string) => Promise<unknown>;
  now?: () => Date;
}

/** Public shape of a user. Explicit allow-list: new model fields are never exposed by accident. */
function profileOf(user: User) {
  return {
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    ageBracket: user.ageBracket,
    emailVerified: user.emailVerifiedAt !== undefined,
    hasPassword: hasPassword(user),
    guardianConsentRecorded: user.guardian?.consentAt !== undefined,
    consents: user.consents.map((c) => ({
      type: c.type,
      noticeVersion: c.noticeVersion,
      at: c.at,
      withdrawnAt: c.withdrawnAt ?? null,
    })),
  };
}

export function createUsersRouter({
  auth,
  users,
  sessions,
  audit,
  hasher,
  cookie,
  exportLearning,
  exportInternships,
  exportSignInMethods,
  now = () => new Date(),
}: Deps): Router {
  const router = Router();
  router.use(requireAuth(auth, cookie));

  const guard = (user: User, action: Parameters<typeof authorize>[1]): void => {
    if (!authorize(user, action, { ownerId: user.id })) {
      throw new AppError(403, "FORBIDDEN", "You are not allowed to do that.");
    }
  };
  const log = (
    res: Parameters<typeof getRequestId>[0],
    req: { ip?: string | undefined },
    user: User,
    action: "user.consent.update" | "user.export" | "user.delete",
    meta?: { consentType?: string; granted?: boolean; reason?: string },
  ) =>
    audit.append({
      at: now(),
      actorId: user.id,
      action,
      requestId: getRequestId(res),
      ipPrefix: ipPrefix(req.ip),
      outcome: "success",
      meta,
    });

  router.get("/me", (_req, res) => {
    const { user } = authLocals(res);
    guard(user, "profile:read");
    res.json({ user: profileOf(user) });
  });

  /** Marketing consent is separate from service consent and off by default (LLD section 3). */
  router.put("/me/consents/marketing", async (req, res) => {
    const { user } = authLocals(res);
    guard(user, "profile:update");
    const input = consentUpdateSchema.parse(req.body);
    await users.setConsent(user.id, "marketing", input.privacyNoticeVersion, now(), input.granted);
    await log(res, req, user, "user.consent.update", {
      consentType: "marketing",
      granted: input.granted,
    });
    res.status(204).end();
  });

  /** Self-service export (Law 058/2021 access right). Own data only; no password hash or internals. */
  router.get("/me/export", async (req, res) => {
    const { user } = authLocals(res);
    guard(user, "profile:export");
    await log(res, req, user, "user.export");
    res.json({
      exportedAt: now().toISOString(),
      account: { ...profileOf(user), createdAt: user.createdAt },
      learning: exportLearning === undefined ? undefined : await exportLearning(user.id),
      internships: exportInternships === undefined ? undefined : await exportInternships(user.id),
      signInMethods:
        exportSignInMethods === undefined ? undefined : await exportSignInMethods(user.id),
    });
  });

  /**
   * Account deletion needs the password again (a stolen session alone must not be enough). The account
   * is marked deleted and every session is revoked; a purge job removes the data after the grace period.
   */
  router.delete("/me", async (req, res) => {
    const { user } = authLocals(res);
    guard(user, "profile:delete");
    const input = deleteAccountSchema.parse(req.body);
    if (hasPassword(user)) {
      if (
        input.password === undefined ||
        !(await hasher.verify(input.password, user.passwordHash))
      ) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      }
    } else if (input.confirmEmail?.toLowerCase() !== user.email.toLowerCase()) {
      // No password to check: the signed-in session plus the typed address is the confirmation.
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    await users.softDelete(user.id, now());
    await sessions.revokeAllForUser(user.id);
    await log(res, req, user, "user.delete");
    clearSessionCookie(res, cookie);
    res.status(204).end();
  });

  return router;
}
