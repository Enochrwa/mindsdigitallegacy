import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../core/errors.js";
import { authLocals } from "../auth/auth.middleware.js";
import { actorOf } from "./admin.context.js";
import type { AdminDeps, StaffGuards } from "./admin.context.js";
import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  otpauthUri,
  stepOf,
  verifyTotp,
} from "./totp.js";

const codeSchema = z.strictObject({ code: z.string().trim().min(6).max(14) });
const FAILURES_BEFORE_LOCK = 5;
const LOCK_MS = 15 * 60_000;

/** Second-factor setup and verification for staff. Only needs a staff session, not a verified one. */
export function createMfaRouter(deps: AdminDeps, guards: StaffGuards): Router {
  const router = Router();
  const { users, sessions } = deps;

  router.post("/mfa/setup", ...guards.session, deps.strictLimiter, async (req, res) => {
    const actor = actorOf(deps, req, res);
    if (actor.user.totp?.enabledAt !== undefined)
      throw new AppError(409, "CONFLICT", "Two-step verification is already on.");
    const secret = generateSecret();
    await users.setTotp(actor.user.id, {
      secretEnc: deps.secretBox.seal(secret),
      recoveryHashes: [],
    });
    await actor.record("admin.mfa.setup", { targetType: "user", targetId: actor.user.id });
    res.json({ secret, otpauthUri: otpauthUri(secret, actor.user.email) });
  });

  /** Confirms the first code, switches the factor on, and returns the recovery codes exactly once. */
  router.post("/mfa/enable", ...guards.session, deps.strictLimiter, async (req, res) => {
    const actor = actorOf(deps, req, res);
    const { code } = codeSchema.parse(req.body);
    const totp = actor.user.totp;
    if (totp === undefined || totp.enabledAt !== undefined)
      throw new AppError(409, "CONFLICT", "Start the setup first.");
    const step = verifyTotp(deps.secretBox.open(totp.secretEnc), code, deps.now());
    if (step === null)
      throw new AppError(
        400,
        "INVALID_CODE",
        "That code is not right. Check the time on your phone and try again.",
      );
    const recovery = generateRecoveryCodes();
    await users.setTotp(actor.user.id, {
      secretEnc: totp.secretEnc,
      enabledAt: deps.now(),
      recoveryHashes: recovery.map(hashRecoveryCode),
      lastStep: step,
    });
    await sessions.setMfaVerified(authLocals(res).sessionFamily, deps.now());
    await actor.record("admin.mfa.enable", { targetType: "user", targetId: actor.user.id });
    res.json({ recoveryCodes: recovery });
  });

  /** Accepts an authenticator code or one recovery code. Repeated failures lock the account for a while. */
  router.post("/mfa/verify", ...guards.session, deps.strictLimiter, async (req, res) => {
    const actor = actorOf(deps, req, res);
    const { code } = codeSchema.parse(req.body);
    const totp = actor.user.totp;
    if (totp?.enabledAt === undefined)
      throw new AppError(409, "CONFLICT", "Two-step verification is not set up.");

    const fail = async (): Promise<never> => {
      const failures = await users.incrementFailedLogins(actor.user.id);
      if (failures >= FAILURES_BEFORE_LOCK)
        await users.lockUntil(actor.user.id, new Date(deps.now().getTime() + LOCK_MS));
      throw new AppError(400, "INVALID_CODE", "That code is not right.");
    };

    if (/^\d{6}$/.test(code)) {
      const step = verifyTotp(deps.secretBox.open(totp.secretEnc), code, deps.now(), totp.lastStep);
      if (step === null) return fail();
      await users.setTotp(actor.user.id, { ...totp, lastStep: step });
    } else {
      const hash = hashRecoveryCode(code);
      if (!totp.recoveryHashes.includes(hash)) return fail();
      await users.setTotp(actor.user.id, {
        ...totp,
        recoveryHashes: totp.recoveryHashes.filter((h) => h !== hash),
      });
      await actor.record("admin.mfa.recovery_used", {
        targetType: "user",
        targetId: actor.user.id,
        detail: `${totp.recoveryHashes.length - 1} left`,
      });
    }
    await users.clearLoginState(actor.user.id);
    await sessions.setMfaVerified(authLocals(res).sessionFamily, deps.now());
    await actor.record("admin.mfa.verify", { targetType: "user", targetId: actor.user.id });
    res.status(204).end();
  });

  return router;
}

/** Exported for tests that need the current step. */
export { stepOf };
