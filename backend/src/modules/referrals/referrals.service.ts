import { createHash, randomInt } from "node:crypto";
import { AppError, notFound } from "../../core/errors.js";
import { ipPrefix } from "../../core/security/tokens.js";
import type { AuditAction, AuditLog } from "../audit/audit.js";
import type { AccessService } from "../access/access.service.js";
import type { RequestContext } from "../auth/auth.service.js";
import type { SettingsRepository } from "../settings/settings.js";
import type { UserRepository } from "../users/users.repository.js";
import { isActive } from "../users/users.types.js";
import type { User } from "../users/users.types.js";
import { canonicalEmail, isBlockedDomain } from "./referrals.disposable.js";
import type { ReferralRepository } from "./referrals.repository.js";
import type { Referral, ReferralCode, ReferralEventType, RejectReason } from "./referrals.types.js";

export interface ReferralDeps {
  referrals: ReferralRepository;
  users: UserRepository;
  settings: SettingsRepository;
  access: AccessService;
  audit: AuditLog;
  now?: () => Date;
}

// 32 characters, no 0/O/1/I/L look-alikes: easy to read aloud or type from a screenshot.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;
export const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;
const DAY = 24 * 60 * 60 * 1000;

export function makeCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

const emailKeyOf = (email: string): string =>
  createHash("sha256").update(canonicalEmail(email)).digest("hex");

/** Stable pseudo-random pick so a referrer keeps the same experiment variant forever. */
function pickVariant(userId: string, thresholds: number[]): number {
  const n = parseInt(createHash("sha256").update(userId).digest("hex").slice(0, 8), 16);
  return thresholds[n % thresholds.length] ?? thresholds[0] ?? 3;
}

export function createReferralService(deps: ReferralDeps) {
  const { referrals, users, settings, access, audit } = deps;
  const now = deps.now ?? ((): Date => new Date());

  const log = (
    action: AuditAction,
    actorId: string | undefined,
    ctx: RequestContext | undefined,
    meta: { targetId?: string; detail?: string; reason?: string },
  ) =>
    audit.append({
      at: now(),
      actorId,
      action,
      requestId: ctx?.requestId ?? "system",
      ipPrefix: ipPrefix(ctx?.ip),
      outcome: "success",
      meta: { targetType: "referral", ...meta },
    });

  async function emit(
    type: ReferralEventType,
    r: {
      code?: string;
      referrerId?: string;
      inviteeId?: string;
      reason?: RejectReason;
      variant?: number | undefined;
    },
  ): Promise<void> {
    await referrals.appendEvent({ at: now(), type, ...r });
  }

  async function codeOwnerVariant(referrerId: string): Promise<number | undefined> {
    return (await referrals.findCodeByUser(referrerId))?.assignedThreshold;
  }

  /** Threshold that applies to this referrer: their experiment variant if any, else the platform value. */
  async function thresholdFor(referrerId: string): Promise<number> {
    const { settings: s } = await settings.get();
    return (await codeOwnerVariant(referrerId)) ?? s.referral.threshold;
  }

  /** Re-evaluates a referrer's credit and grants or withdraws the referral unlock to match. */
  async function reconcile(referrerId: string, ctx?: RequestContext): Promise<void> {
    const { settings: s } = await settings.get();
    const counts = await referrals.countByStatus(referrerId);
    const earned = s.referral.enabled && counts.qualified >= (await thresholdFor(referrerId));
    if (earned) {
      const had = (await access.listForUser(referrerId)).some(
        (e) => e.via === "referral" && e.revokedAt === undefined,
      );
      await access.grant(referrerId, { type: "all" }, "referral", { ctx });
      if (!had) await emit("unlocked", { referrerId, variant: await codeOwnerVariant(referrerId) });
    } else {
      await access.revokeVia(referrerId, "referral", undefined, ctx);
    }
  }

  /** Cap and velocity checks that send a referral to staff instead of counting it. Null = fine. */
  async function flagFor(
    ref: Referral,
    s: Awaited<ReturnType<SettingsRepository["get"]>>["settings"],
  ): Promise<RejectReason | null> {
    const sameNet = await referrals.countQualifiedFromNetwork(ref.referrerId, ref.ipPrefix);
    if (sameNet >= s.referral.maxQualifiedPerNetwork) return "network_cap";
    if (
      (await referrals.countCreatedSince(ref.code, new Date(now().getTime() - DAY))) >
      s.referral.maxNewPerCodePerDay
    )
      return "velocity";
    return null;
  }

  return {
    reconcile,
    thresholdFor,

    /** The learner's own code, created on first use. */
    async getOrCreateCode(userId: string): Promise<ReferralCode> {
      const existing = await referrals.findCodeByUser(userId);
      if (existing !== null) return existing;
      const { settings: s } = await settings.get();
      const assignedThreshold = s.referral.experiment.enabled
        ? pickVariant(userId, s.referral.experiment.thresholds)
        : undefined;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await referrals.createCode({
            userId,
            code: makeCode(),
            assignedThreshold,
            now: now(),
          });
        } catch (err) {
          if (!(err instanceof Error) || err.message !== "CODE_TAKEN") throw err;
        }
      }
      throw new AppError(500, "INTERNAL", "Something went wrong on our side.");
    },

    /** What the referrer sees. Never contains rejections, reasons or other people's details. */
    async myStatus(userId: string) {
      const code = await this.getOrCreateCode(userId);
      const { settings: s } = await settings.get();
      const counts = await referrals.countByStatus(userId);
      const threshold = code.assignedThreshold ?? s.referral.threshold;
      const unlocked = (await access.listForUser(userId)).some(
        (e) => e.via === "referral" && e.revokedAt === undefined,
      );
      return {
        enabled: s.referral.enabled,
        code: code.status === "active" ? code.code : null,
        threshold,
        joined: Math.min(counts.qualified, threshold),
        waiting: counts.pending + counts.needs_review,
        unlocked,
      };
    },

    /** Public landing visit. Counts a funnel step; reveals nothing about whether the code exists. */
    async recordVisit(rawCode: string, ctx: RequestContext): Promise<void> {
      const code = CODE_PATTERN.test(rawCode.toUpperCase())
        ? await referrals.findCode(rawCode)
        : null;
      if (code === null || code.status !== "active") return;
      await emit("visit", {
        code: code.code,
        referrerId: code.userId,
        variant: code.assignedThreshold,
      });
      void ctx;
    },

    /** Called when someone registers through a link. Never throws to the caller and never reveals why it did not count. */
    async onRegistered(invitee: User, rawCode: string, ctx: RequestContext): Promise<void> {
      if (!CODE_PATTERN.test(rawCode.toUpperCase())) return;
      const code = await referrals.findCode(rawCode);
      if (code === null || code.status !== "active") return;
      const { settings: s } = await settings.get();
      if (!s.referral.enabled) return;

      const referrer = await users.findById(code.userId);
      const emailKey = emailKeyOf(invitee.email);
      let status: Referral["status"] = "pending";
      let reason: RejectReason | undefined;
      if (
        referrer === null ||
        code.userId === invitee.id ||
        emailKeyOf(referrer.email) === emailKey
      ) {
        status = "rejected";
        reason = "self_referral";
      } else if (isBlockedDomain(invitee.email, s.referral.blockedEmailDomains)) {
        status = "rejected";
        reason = "disposable_email";
      } else if (await referrals.existsOtherWithEmailKey(emailKey, invitee.id)) {
        status = "rejected";
        reason = "duplicate_contact";
      }
      const row = await referrals.create({
        referrerId: code.userId,
        inviteeId: invitee.id,
        code: code.code,
        status,
        reason,
        ipPrefix: ipPrefix(ctx.ip),
        emailKey,
        createdAt: now(),
      });
      await emit("attributed", {
        code: code.code,
        referrerId: code.userId,
        inviteeId: invitee.id,
        variant: code.assignedThreshold,
      });
      await log("referral.attributed", invitee.id, ctx, { targetId: row.id });
      if (status === "rejected") {
        await emit("rejected", {
          code: code.code,
          referrerId: code.userId,
          inviteeId: invitee.id,
          reason,
          variant: code.assignedThreshold,
        });
        await log("referral.rejected", undefined, ctx, { targetId: row.id, reason });
      }
    },

    /** Called once an account becomes usable (email verified, and guardian consent for under-16s). */
    async onActivated(inviteeId: string): Promise<void> {
      const ref = await referrals.findByInvitee(inviteeId);
      if (ref?.status !== "pending") return;
      const invitee = await users.findById(inviteeId);
      if (invitee === null || !isActive(invitee)) return; // wait: guardian consent may still be missing
      const referrer = await users.findById(ref.referrerId);
      const variant = await codeOwnerVariant(ref.referrerId);
      const { settings: s } = await settings.get();
      const reject = async (reason: RejectReason): Promise<void> => {
        await referrals.update(ref.id, { status: "rejected", reason });
        await emit("rejected", {
          code: ref.code,
          referrerId: ref.referrerId,
          inviteeId,
          reason,
          variant,
        });
        await log("referral.rejected", undefined, undefined, { targetId: ref.id, reason });
      };
      if (referrer === null || !isActive(referrer)) return reject("referrer_inactive");
      if (!s.referral.enabled) return; // stays pending until the programme is switched back on

      const flag = await flagFor(ref, s);
      if (flag !== null) {
        await referrals.update(ref.id, { status: "needs_review", reason: flag });
        await emit("needs_review", {
          code: ref.code,
          referrerId: ref.referrerId,
          inviteeId,
          reason: flag,
          variant,
        });
        return;
      }
      await referrals.update(ref.id, { status: "qualified", qualifiedAt: now() });
      await emit("qualified", { code: ref.code, referrerId: ref.referrerId, inviteeId, variant });
      await log("referral.qualified", undefined, undefined, { targetId: ref.id });
      await reconcile(ref.referrerId);
    },

    // ---- Staff actions ----

    /** Lets a flagged referral count (a real classroom behind one network, for example). */
    async approve(id: string, staffId: string, ctx: RequestContext): Promise<void> {
      const ref = await referrals.findById(id);
      if (ref === null) throw notFound();
      if (ref.status !== "needs_review")
        throw new AppError(409, "CONFLICT", "Only referrals waiting for review can be approved.");
      await referrals.update(id, {
        status: "qualified",
        qualifiedAt: now(),
        reviewedAt: now(),
        reviewedBy: staffId,
      });
      await emit("approved", {
        code: ref.code,
        referrerId: ref.referrerId,
        inviteeId: ref.inviteeId,
        variant: await codeOwnerVariant(ref.referrerId),
      });
      await log("referral.approved", staffId, ctx, { targetId: id });
      await reconcile(ref.referrerId, ctx);
    },

    async reject(id: string, staffId: string, ctx: RequestContext): Promise<void> {
      const ref = await referrals.findById(id);
      if (ref === null) throw notFound();
      if (ref.status === "rejected" || ref.status === "revoked") return;
      const wasCounted = ref.status === "qualified";
      await referrals.update(id, {
        status: wasCounted ? "revoked" : "rejected",
        reason: wasCounted ? "fraud_revoked" : "staff_rejected",
        reviewedAt: now(),
        reviewedBy: staffId,
      });
      await emit(wasCounted ? "revoked" : "rejected", {
        code: ref.code,
        referrerId: ref.referrerId,
        inviteeId: ref.inviteeId,
        reason: wasCounted ? "fraud_revoked" : "staff_rejected",
        variant: await codeOwnerVariant(ref.referrerId),
      });
      await log(wasCounted ? "referral.revoked" : "referral.rejected", staffId, ctx, {
        targetId: id,
      });
      if (wasCounted) await reconcile(ref.referrerId, ctx);
    },

    async setCodeStatus(codeId: string, status: "active" | "disabled"): Promise<void> {
      await referrals.setCodeStatus(codeId, status);
    },
  };
}
export type ReferralService = ReturnType<typeof createReferralService>;
