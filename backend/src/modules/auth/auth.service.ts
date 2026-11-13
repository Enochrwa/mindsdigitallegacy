import { AppError } from "../../core/errors.js";
import { checkPassword } from "../../core/security/passwordPolicy.js";
import type { BreachChecker } from "../../core/security/breach.js";
import type { PasswordHasher } from "../../core/security/password.js";
import { generateToken, hashToken, ipPrefix } from "../../core/security/tokens.js";
import type { AuditAction, AuditLog } from "../audit/audit.js";
import type { SessionRepository } from "../sessions/sessions.types.js";
import type { UserRepository } from "../users/users.repository.js";
import { DuplicateEmailError, isActive } from "../users/users.types.js";
import type { User } from "../users/users.types.js";
import type { AuthTokenRepository, TokenPurpose } from "./authTokens.js";
import type { RegisterInput } from "./auth.schema.js";
import type { Mailer } from "./mailer.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Session lifetimes (LLD section 4). The learner absolute limit is a choice made here: review it. */
export const SESSION_POLICY = {
  learner: { idleMs: 30 * DAY, absoluteMs: 90 * DAY },
  admin: { idleMs: 12 * HOUR, absoluteMs: 7 * DAY },
  rotateAfterMs: DAY,
  /** A just-rotated id is still accepted briefly so parallel browser requests do not trip reuse detection. */
  reuseGraceMs: 10_000,
} as const;

const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  verify_email: DAY,
  reset_password: HOUR,
  guardian_consent: 7 * DAY,
};

const LOCK_AFTER_FAILURES = 5;
const LOCK_BASE_MS = 30_000;
const LOCK_MAX_MS = 15 * 60_000;

export const PRIVACY_NOTICE_VERSION_FALLBACK = "unversioned";

export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
  requestId: string;
}

export interface AuthenticatedSession {
  user: User;
  sessionFamily: string;
  /** Present when the session id was rotated; the caller must set the new cookie. */
  rotated?: { token: string; maxAgeSeconds: number };
}

export interface LoginResult {
  user: User;
  token: string;
  maxAgeSeconds: number;
}

export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  tokens: AuthTokenRepository;
  audit: AuditLog;
  mailer: Mailer;
  hasher: PasswordHasher;
  breach: BreachChecker;
  now?: () => Date;
}

const invalidCredentials = (): AppError =>
  new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
const breachedPassword = (): AppError =>
  new AppError(400, "VALIDATION_ERROR", "Some fields are invalid.", [
    {
      path: "password",
      message: "This password has appeared in a data breach. Choose a different one.",
    },
  ]);
const invalidToken = (): AppError =>
  new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired.");

function policyFor(user: User): (typeof SESSION_POLICY)["learner"] {
  return user.roles.includes("admin") ? SESSION_POLICY.admin : SESSION_POLICY.learner;
}

function summariseUserAgent(ua: string | undefined): string {
  return (ua ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, 80);
}

export function createAuthService(deps: AuthDeps) {
  const { users, sessions, tokens, audit, mailer, hasher, breach } = deps;
  const now = deps.now ?? ((): Date => new Date());

  // A real hash computed once, verified against when the account does not exist, so "no such user"
  // and "wrong password" cost the same time.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = (): Promise<string> =>
    (dummyHash ??= hasher.hash("dummy-password-for-timing"));

  async function record(
    action: AuditAction,
    ctx: RequestContext,
    outcome: "success" | "failure",
    actorId?: string,
    meta?: { reason?: string; consentType?: string; granted?: boolean },
  ): Promise<void> {
    await audit.append({
      at: now(),
      actorId,
      action,
      requestId: ctx.requestId,
      ipPrefix: ipPrefix(ctx.ip),
      outcome,
      meta,
    });
  }

  async function issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
    const token = generateToken();
    await tokens.create({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(now().getTime() + TOKEN_TTL_MS[purpose]),
    });
    return token;
  }

  async function startSession(user: User, ctx: RequestContext, family?: string, startedAt?: Date) {
    const policy = policyFor(user);
    const at = now();
    const token = generateToken();
    const absoluteExpiresAt = startedAt
      ? new Date(startedAt.getTime() + policy.absoluteMs)
      : new Date(at.getTime() + policy.absoluteMs);
    const expiresAt = new Date(Math.min(at.getTime() + policy.idleMs, absoluteExpiresAt.getTime()));
    await sessions.create({
      userId: user.id,
      tokenHash: hashToken(token),
      family: family ?? generateToken(),
      createdAt: at,
      lastUsedAt: at,
      expiresAt,
      absoluteExpiresAt,
      userAgentSummary: summariseUserAgent(ctx.userAgent),
      ipPrefix: ipPrefix(ctx.ip),
    });
    return { token, maxAgeSeconds: Math.floor((expiresAt.getTime() - at.getTime()) / 1000) };
  }

  return {
    /**
     * Always resolves the same way for new and existing addresses (no account enumeration). An existing
     * owner is told by email instead. Policy violations on the password are reported, because they
     * reveal nothing about other accounts.
     */
    async register(input: RegisterInput, ctx: RequestContext): Promise<void> {
      const problem = checkPassword(input.password, {
        email: input.email,
        displayName: input.displayName,
      });
      if (problem !== undefined) {
        throw new AppError(400, "VALIDATION_ERROR", "Some fields are invalid.", [
          { path: "password", message: problem },
        ]);
      }
      if (await breach.isBreached(input.password)) throw breachedPassword();
      // Hash before looking the address up so both branches take similar time.
      const passwordHash = await hasher.hash(input.password);
      const at = now();

      const existing = await users.findByEmail(input.email);
      if (existing !== null) {
        await mailer.sendExistingAccountNotice(input.email);
        await record("auth.register", ctx, "failure", undefined, { reason: "email_exists" });
        return;
      }

      let user: User;
      try {
        user = await users.create({
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          roles: ["learner"],
          ageBracket: input.ageBracket,
          guardian: input.guardianEmail === undefined ? undefined : { email: input.guardianEmail },
          consents: [{ type: "service", noticeVersion: input.privacyNoticeVersion, at }],
          emailVerifiedAt: undefined,
          phone: undefined,
          lockedUntil: undefined,
          deletedAt: undefined,
        });
      } catch (err) {
        if (err instanceof DuplicateEmailError) {
          await mailer.sendExistingAccountNotice(input.email);
          return;
        }
        throw err;
      }

      await mailer.sendVerification(user.email, await issueToken(user.id, "verify_email"));
      if (user.ageBracket === "under_16" && user.guardian !== undefined) {
        await mailer.sendGuardianConsent(
          user.guardian.email,
          user.displayName,
          await issueToken(user.id, "guardian_consent"),
        );
      }
      await record("auth.register", ctx, "success", user.id);
    },

    async verifyEmail(token: string, ctx: RequestContext): Promise<void> {
      const userId = await tokens.consume("verify_email", hashToken(token), now());
      if (userId === null) throw invalidToken();
      await users.markEmailVerified(userId, now());
      await record("auth.verify_email", ctx, "success", userId);
    },

    /** For people whose first verification mail was lost. Same answer whether or not the address exists. */
    async resendVerification(email: string, ctx: RequestContext): Promise<void> {
      const user = await users.findByEmail(email);
      if (user !== null && user.deletedAt === undefined && user.emailVerifiedAt === undefined) {
        await mailer.sendVerification(user.email, await issueToken(user.id, "verify_email"));
      }
      await record("auth.verify_email", ctx, "failure", user?.id, { reason: "resend_requested" });
    },

    async confirmGuardian(token: string, ctx: RequestContext): Promise<void> {
      const userId = await tokens.consume("guardian_consent", hashToken(token), now());
      if (userId === null) throw invalidToken();
      await users.recordGuardianConsent(userId, now(), "email_link");
      await record("auth.guardian_consent", ctx, "success", userId);
    },

    async login(email: string, password: string, ctx: RequestContext): Promise<LoginResult> {
      const user = await users.findByEmail(email);
      const stored =
        user !== null && user.deletedAt === undefined ? user.passwordHash : await getDummyHash();
      const passwordOk = await hasher.verify(password, stored);
      const at = now();

      if (user === null || user.deletedAt !== undefined) {
        await record("auth.login.failure", ctx, "failure", undefined, { reason: "unknown" });
        throw invalidCredentials();
      }
      // Locked accounts answer exactly like a wrong password, even for the right one.
      if (user.lockedUntil !== undefined && user.lockedUntil > at) {
        await record("auth.login.failure", ctx, "failure", user.id, { reason: "locked" });
        throw invalidCredentials();
      }
      if (!passwordOk) {
        const failures = await users.incrementFailedLogins(user.id);
        if (failures >= LOCK_AFTER_FAILURES) {
          const wait = Math.min(LOCK_BASE_MS * 2 ** (failures - LOCK_AFTER_FAILURES), LOCK_MAX_MS);
          await users.lockUntil(user.id, new Date(at.getTime() + wait));
        }
        await record("auth.login.failure", ctx, "failure", user.id, { reason: "password" });
        throw invalidCredentials();
      }
      // The password is proven, so it is safe to say why the account cannot be used yet.
      if (!isActive(user)) {
        await record("auth.login.failure", ctx, "failure", user.id, { reason: "inactive" });
        throw new AppError(
          403,
          "ACCOUNT_NOT_ACTIVE",
          "Your account is not active yet. Check your email for the verification link, or your guardian's confirmation.",
        );
      }
      if (user.failedLogins > 0 || user.lockedUntil !== undefined)
        await users.clearLoginState(user.id);

      const session = await startSession(user, ctx);
      await record("auth.login.success", ctx, "success", user.id);
      return { user, ...session };
    },

    /** Returns null for any unusable session. Rotates old session ids and detects reuse of rotated ones. */
    async authenticate(token: string, ctx: RequestContext): Promise<AuthenticatedSession | null> {
      const session = await sessions.findByTokenHash(hashToken(token));
      if (session === null) return null;
      const at = now();
      if (session.expiresAt <= at || session.absoluteExpiresAt <= at) {
        await sessions.revokeFamily(session.family);
        return null;
      }

      if (session.rotatedAt !== undefined) {
        if (at.getTime() - session.rotatedAt.getTime() > SESSION_POLICY.reuseGraceMs) {
          // A replaced id is back: assume theft and kill the whole family.
          await sessions.revokeFamily(session.family);
          await record("auth.session.reuse_detected", ctx, "failure", session.userId);
          return null;
        }
      }

      const user = await users.findById(session.userId);
      if (user === null || !isActive(user)) {
        await sessions.revokeFamily(session.family);
        return null;
      }
      if (session.rotatedAt !== undefined) return { user, sessionFamily: session.family };

      const policy = policyFor(user);
      if (at.getTime() - session.createdAt.getTime() >= SESSION_POLICY.rotateAfterMs) {
        await sessions.markRotated(session.id, at);
        const next = await startSession(
          user,
          ctx,
          session.family,
          new Date(session.absoluteExpiresAt.getTime() - policy.absoluteMs),
        );
        return { user, sessionFamily: session.family, rotated: next };
      }

      const newExpiry = new Date(
        Math.min(at.getTime() + policy.idleMs, session.absoluteExpiresAt.getTime()),
      );
      await sessions.touch(session.id, at, newExpiry);
      return { user, sessionFamily: session.family };
    },

    async logout(token: string, userId: string, ctx: RequestContext): Promise<void> {
      const session = await sessions.findByTokenHash(hashToken(token));
      if (session !== null && session.userId === userId)
        await sessions.revokeFamily(session.family);
      await record("auth.logout", ctx, "success", userId);
    },

    /** Always succeeds from the caller's point of view. */
    async requestPasswordReset(email: string, ctx: RequestContext): Promise<void> {
      const user = await users.findByEmail(email);
      if (user !== null && isActive(user)) {
        await mailer.sendPasswordReset(user.email, await issueToken(user.id, "reset_password"));
      }
      await record("auth.password_reset.request", ctx, "success", user?.id);
    },

    async resetPassword(token: string, password: string, ctx: RequestContext): Promise<void> {
      const tokenHash = hashToken(token);
      const peeked = await tokens.peek("reset_password", tokenHash, now());
      if (peeked === null) throw invalidToken();
      const user = await users.findById(peeked);
      if (user === null || user.deletedAt !== undefined) throw invalidToken();
      // Validate before spending the single-use token, so a weak password does not burn the link.
      const problem = checkPassword(password, { email: user.email, displayName: user.displayName });
      if (problem !== undefined) {
        throw new AppError(400, "VALIDATION_ERROR", "Some fields are invalid.", [
          { path: "password", message: problem },
        ]);
      }
      if (await breach.isBreached(password)) throw breachedPassword();
      const userId = await tokens.consume("reset_password", tokenHash, now());
      if (userId === null) throw invalidToken();
      await users.setPasswordHash(userId, await hasher.hash(password));
      await users.clearLoginState(userId);
      await sessions.revokeAllForUser(userId);
      await record("auth.password_reset.complete", ctx, "success", userId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
