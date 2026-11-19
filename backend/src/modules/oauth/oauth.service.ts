import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "../../core/errors.js";
import { generateToken, ipPrefix } from "../../core/security/tokens.js";
import type { AuditAction, AuditLog, AuditMeta } from "../audit/audit.js";
import type { Mailer } from "../auth/mailer.js";
import type { AuthService, LoginResult, RequestContext } from "../auth/auth.service.js";
import { hasPassword } from "../users/users.types.js";
import type { UserRepository } from "../users/users.repository.js";
import type { User } from "../users/users.types.js";
import type { OAuthIdentity, OAuthIdentityRepository } from "./oauth.repository.js";
import { PROVIDER_LABEL, ProviderError } from "./oauth.types.js";
import type { ProviderAdapter, ProviderId } from "./oauth.types.js";
import type { Sealer } from "./seal.js";

/**
 * Sign in and sign up with a provider (Google, Microsoft, GitHub, Facebook, LinkedIn).
 *
 * The rules that keep it safe, each covered by a test:
 *  1. The `state` is sealed into the visitor's own cookie, so a callback only works in the browser that
 *     started it (blocks login CSRF and "authorization code injection").
 *  2. An identity is the provider's stable id, never the email. Emails change and get reassigned.
 *  3. A provider account is NEVER silently attached to an existing MDL account because the emails match.
 *     Linking happens only while signed in, started by that person (blocks account takeover by email).
 *  4. A new account is created only with a proven email: the provider vouches for it (Google, GitHub,
 *     LinkedIn) or the person types a code we mailed them (Microsoft, Facebook).
 *  5. New people still choose their age group and accept the privacy notice, so the under-16 guardian
 *     rule applies to them exactly as it does to email sign-up.
 *  6. Visitors only ever see the fixed error codes below, never text from a provider.
 */

export type OAuthFailure =
  | "denied" // the person pressed Cancel at the provider
  | "failed" // anything wrong or suspicious: bad state, bad code, bad token
  | "expired" // the sign-in took too long or the cookie is gone
  | "unavailable" // the provider could not be reached
  | "email_missing" // the provider gave no email
  | "account_exists" // an MDL account already uses that email
  | "identity_in_use" // that provider account belongs to someone else
  | "inactive"; // the account exists but is not usable yet

export type CallbackResult =
  | { kind: "signed_in"; login: LoginResult; next: string }
  | { kind: "linked"; provider: ProviderId }
  | { kind: "signup"; cookie: string }
  | { kind: "error"; code: OAuthFailure; intent: "signin" | "link" };

export type SignupResult =
  | { kind: "signed_in"; login: LoginResult }
  | { kind: "guardian_pending" }
  | { kind: "code_sent"; cookie: string; email: string };

export interface SignupInput {
  ageBracket: "under_16" | "16_plus";
  guardianEmail?: string | undefined;
  privacyNoticeVersion: string;
  referralCode?: string | undefined;
}

interface StatePayload extends Record<string, unknown> {
  p: ProviderId;
  s: string;
  n: string;
  v: string;
  i: "signin" | "link";
  u?: string;
  x: string;
}

interface PendingPayload extends Record<string, unknown> {
  pid: string;
  p: ProviderId;
  sub: string;
  email: string;
  ev: boolean;
  name: string;
  stage: 1 | 2;
  input?: SignupInput;
}

export interface OAuthServiceDeps {
  providers: Map<ProviderId, ProviderAdapter>;
  identities: OAuthIdentityRepository;
  users: UserRepository;
  auth: Pick<AuthService, "signInVerified" | "registerFromIdentity">;
  audit: AuditLog;
  mailer: Mailer;
  sealer: Sealer;
  /** Public address of the API, for the redirect address registered with each provider. */
  apiPublicUrl: string;
  now?: () => Date;
}

const STATE_TTL_MS = 10 * 60_000;
const SIGNUP_TTL_MS = 15 * 60_000;
export const STATE_COOKIE = "mdl_oauth_state";
export const SIGNUP_COOKIE = "mdl_oauth_signup";

const b64url = (buf: Buffer): string => buf.toString("base64url");
const sha256 = (s: string): Buffer => createHash("sha256").update(s).digest();

const equal = (a: string, b: string): boolean => {
  const x = sha256(a);
  const y = sha256(b);
  return timingSafeEqual(x, y);
};

/** Only same-site paths may follow a sign-in. Anything else (other sites, `//host`, `\`) becomes /account. */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return "/account";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/account";
  if ([...raw].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return "/account";
  return raw;
}

/** Provider names are untrusted text. Keep it short, printable and never empty. */
export function cleanName(raw: string, fallback = "MDL learner"): string {
  const name = [...raw]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127 && ch !== "<" && ch !== ">";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return name.length >= 2 ? name : fallback;
}

export function createOAuthService(deps: OAuthServiceDeps) {
  const { providers, identities, users, auth, audit, mailer, sealer, apiPublicUrl } = deps;
  const now = deps.now ?? ((): Date => new Date());

  const redirectUri = (p: ProviderId): string =>
    `${apiPublicUrl.replace(/\/+$/, "")}/api/v1/auth/oauth/${p}/callback`;

  async function record(
    action: AuditAction,
    ctx: RequestContext,
    outcome: "success" | "failure",
    actorId: string | undefined,
    meta?: AuditMeta,
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

  const adapter = (id: ProviderId): ProviderAdapter => {
    const found = providers.get(id);
    if (found === undefined) throw new AppError(404, "NOT_FOUND", "Not found.");
    return found;
  };

  /** The code the person types. Derived from the sealed pending sign-up, so nothing is stored. */
  function emailCode(pending: Pick<PendingPayload, "pid" | "email">): string {
    const digest = createHmac("sha256", sealer.derive("email-code"))
      .update(`${pending.pid}:${pending.email.toLowerCase()}`)
      .digest();
    return String(digest.readUInt32BE(0) % 100_000_000).padStart(8, "0");
  }

  async function finish(
    pending: PendingPayload,
    input: SignupInput,
    ctx: RequestContext,
  ): Promise<SignupResult> {
    // Re-check at the last moment: another tab or person may have taken the email or the provider account.
    if ((await identities.findByProviderSubject(pending.p, pending.sub)) !== null) {
      throw new AppError(
        409,
        "IDENTITY_IN_USE",
        "This account is already registered. Try signing in.",
      );
    }
    const user = await auth.registerFromIdentity(
      {
        email: pending.email,
        displayName: cleanName(pending.name),
        ageBracket: input.ageBracket,
        guardianEmail: input.guardianEmail,
        privacyNoticeVersion: input.privacyNoticeVersion,
        referralCode: input.referralCode,
        method: pending.p,
      },
      ctx,
    );
    try {
      await identities.create(
        { userId: user.id, provider: pending.p, subject: pending.sub, email: pending.email },
        now(),
      );
    } catch (err) {
      if (err instanceof Error && err.message === "DUPLICATE") {
        throw new AppError(
          409,
          "IDENTITY_IN_USE",
          "This account is already registered. Try signing in.",
        );
      }
      throw err;
    }
    try {
      return { kind: "signed_in", login: await auth.signInVerified(user, pending.p, ctx) };
    } catch (err) {
      // An under-16 account waits for the guardian; that is expected, not an error.
      if (err instanceof AppError && err.code === "ACCOUNT_NOT_ACTIVE")
        return { kind: "guardian_pending" };
      throw err;
    }
  }

  return {
    enabled: (): { id: ProviderId; label: string }[] =>
      [...providers.values()].map((p) => ({ id: p.id, label: p.label })),

    /** Builds the provider address and the sealed state cookie. `userId` is set only for "link". */
    begin(
      id: ProviderId,
      opts: { intent: "signin" | "link"; userId?: string; next?: unknown },
    ): { url: string; cookie: string } {
      const provider = adapter(id);
      const state = generateToken();
      const nonce = generateToken();
      const verifier = b64url(randomBytes(32));
      const payload: StatePayload = {
        p: id,
        s: state,
        n: nonce,
        v: verifier,
        i: opts.intent,
        x: safeNext(opts.next),
        ...(opts.userId === undefined ? {} : { u: opts.userId }),
      };
      return {
        url: provider.authorizeUrl({
          state,
          nonce,
          challenge: b64url(sha256(verifier)),
          redirectUri: redirectUri(id),
        }),
        cookie: sealer.seal("oauth-state", payload, STATE_TTL_MS),
      };
    },

    /** Handles the provider's redirect back. Never throws for expected problems; returns an error code. */
    async callback(
      id: ProviderId,
      query: { code?: unknown; state?: unknown; error?: unknown },
      stateCookie: string | undefined,
      sessionUser: User | null,
      ctx: RequestContext,
    ): Promise<CallbackResult> {
      let intent: "signin" | "link" = "signin";
      const fail = async (code: OAuthFailure, actor?: string): Promise<CallbackResult> => {
        await record("auth.oauth.failure", ctx, "failure", actor, { reason: code, detail: id });
        return { kind: "error", code, intent };
      };

      const bundle = sealer.unseal<StatePayload>("oauth-state", stateCookie);
      if (bundle === null) return fail("expired");
      intent = bundle.i;
      if (bundle.p !== id) return fail("failed");
      if (typeof query.state !== "string" || !equal(query.state, bundle.s)) return fail("failed");
      if (typeof query.error === "string")
        return fail(query.error === "access_denied" ? "denied" : "failed");
      if (typeof query.code !== "string" || query.code === "" || query.code.length > 2048)
        return fail("failed");

      let profile;
      try {
        profile = await adapter(id).exchange({
          code: query.code,
          verifier: bundle.v,
          redirectUri: redirectUri(id),
          nonce: bundle.n,
        });
      } catch (err) {
        if (err instanceof ProviderError)
          return fail(err.code === "email_missing" ? "email_missing" : "failed");
        return fail("unavailable");
      }

      const existing = await identities.findByProviderSubject(id, profile.subject);

      if (bundle.i === "link") {
        // Linking needs the very session that started it. A different or missing session is refused.
        if (sessionUser === null || bundle.u === undefined || sessionUser.id !== bundle.u)
          return fail("failed");
        if (existing !== null) {
          return existing.userId === sessionUser.id
            ? { kind: "linked", provider: id }
            : fail("identity_in_use", sessionUser.id);
        }
        try {
          await identities.create(
            {
              userId: sessionUser.id,
              provider: id,
              subject: profile.subject,
              email: profile.email,
            },
            now(),
          );
        } catch {
          return fail("identity_in_use", sessionUser.id);
        }
        await record("auth.oauth.link", ctx, "success", sessionUser.id, { detail: id });
        return { kind: "linked", provider: id };
      }

      if (existing !== null) {
        const user = await users.findById(existing.userId);
        if (user === null || user.deletedAt !== undefined) return fail("failed");
        try {
          const login = await auth.signInVerified(user, id, ctx);
          await identities.touch(existing.id, now());
          return { kind: "signed_in", login, next: bundle.x };
        } catch (err) {
          if (err instanceof AppError && err.code === "ACCOUNT_NOT_ACTIVE")
            return { kind: "error", code: "inactive", intent };
          throw err;
        }
      }

      // A brand-new person. Rule 3: if the email already belongs to an MDL account, do NOT merge.
      if (profile.email === undefined) return fail("email_missing");
      if ((await users.findByEmail(profile.email)) !== null) return fail("account_exists");

      const pending: PendingPayload = {
        pid: generateToken(),
        p: id,
        sub: profile.subject,
        email: profile.email.toLowerCase(),
        ev: profile.emailVerified,
        name: cleanName(profile.name),
        stage: 1,
      };
      return { kind: "signup", cookie: sealer.seal("oauth-signup", pending, SIGNUP_TTL_MS) };
    },

    /** What the sign-up page may show: the provider and the email, so the person knows who they are joining as. */
    pending(cookie: string | undefined): {
      provider: ProviderId;
      label: string;
      email: string;
      name: string;
      needsCode: boolean;
      codeSent: boolean;
    } | null {
      const p = sealer.unseal<PendingPayload>("oauth-signup", cookie);
      if (p === null) return null;
      return {
        provider: p.p,
        label: PROVIDER_LABEL[p.p],
        email: p.email,
        name: p.name,
        needsCode: !p.ev,
        codeSent: p.stage === 2,
      };
    },

    /**
     * Step 2 of sign-up: age group and consent. If the provider vouched for the email the account is made
     * now; otherwise a code is mailed and the person confirms it with `confirmCode`.
     */
    async completeSignup(
      cookie: string | undefined,
      input: SignupInput,
      ctx: RequestContext,
    ): Promise<SignupResult> {
      const pending = sealer.unseal<PendingPayload>("oauth-signup", cookie);
      if (pending === null)
        throw new AppError(400, "SIGNUP_EXPIRED", "Your sign-up expired. Please start again.");
      if (
        input.guardianEmail !== undefined &&
        input.guardianEmail.toLowerCase() === pending.email
      ) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "The guardian email must differ from your own.",
          [{ path: "guardianEmail", message: "The guardian email must differ from your own" }],
        );
      }
      if (pending.ev) return finish(pending, input, ctx);

      if ((await users.findByEmail(pending.email)) !== null) {
        throw new AppError(409, "ACCOUNT_EXISTS", "An account with this email already exists.");
      }
      const next: PendingPayload = { ...pending, stage: 2, input };
      await mailer.sendSignInCode(pending.email, cleanName(pending.name), emailCode(pending));
      await record("auth.oauth.signup", ctx, "failure", undefined, {
        reason: "code_sent",
        detail: pending.p,
      });
      return {
        kind: "code_sent",
        cookie: sealer.seal("oauth-signup", next, SIGNUP_TTL_MS),
        email: pending.email,
      };
    },

    async confirmCode(
      cookie: string | undefined,
      code: string,
      ctx: RequestContext,
    ): Promise<SignupResult> {
      const pending = sealer.unseal<PendingPayload>("oauth-signup", cookie);
      if (pending === null)
        throw new AppError(400, "SIGNUP_EXPIRED", "Your sign-up expired. Please start again.");
      if (pending.stage !== 2 || pending.input === undefined) {
        throw new AppError(400, "CODE_NOT_SENT", "Request a code first.");
      }
      if (!equal(code.replace(/\s+/g, ""), emailCode(pending))) {
        await record("auth.oauth.failure", ctx, "failure", undefined, {
          reason: "bad_code",
          detail: pending.p,
        });
        throw new AppError(
          400,
          "INVALID_CODE",
          "That code is not right. Check your email and try again.",
        );
      }
      return finish(pending, pending.input, ctx);
    },

    async list(userId: string): Promise<{ identities: OAuthIdentity[]; canRemoveAll: boolean }> {
      const rows = await identities.listByUser(userId);
      const user = await users.findById(userId);
      return { identities: rows, canRemoveAll: user !== null && hasPassword(user) };
    },

    /** A person can never remove their last way to sign in. */
    async unlink(user: User, provider: ProviderId, ctx: RequestContext): Promise<void> {
      const rows = await identities.listByUser(user.id);
      if (!rows.some((r) => r.provider === provider))
        throw new AppError(404, "NOT_FOUND", "Not found.");
      if (!hasPassword(user) && rows.length <= 1) {
        throw new AppError(
          409,
          "LAST_SIGN_IN_METHOD",
          "Add a password before disconnecting your only sign-in method.",
        );
      }
      await identities.remove(user.id, provider);
      await record("auth.oauth.unlink", ctx, "success", user.id, { detail: provider });
    },
  };
}

export type OAuthService = ReturnType<typeof createOAuthService>;
