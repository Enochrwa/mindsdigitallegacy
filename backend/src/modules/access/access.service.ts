import { AppError } from "../../core/errors.js";
import { ipPrefix } from "../../core/security/tokens.js";
import type { AuditAction, AuditLog } from "../audit/audit.js";
import type { RequestContext } from "../auth/auth.service.js";
import type { CatalogueRepository, EnrolmentRepository } from "../courses/courses.repository.js";
import type {
  EntitlementRepository,
  EntitlementScope,
  EntitlementVia,
  UnlockCodeRepository,
} from "./access.types.js";
import { covers } from "./access.types.js";

export interface AccessDeps {
  entitlements: EntitlementRepository;
  unlockCodes: UnlockCodeRepository;
  enrolments: EnrolmentRepository;
  catalogue: CatalogueRepository;
  audit: AuditLog;
  now?: () => Date;
}

const invalidCode = (): AppError => new AppError(400, "INVALID_CODE", "This code is not valid.");
const PRIORITY: EntitlementVia[] = ["admin", "code", "referral"];

/**
 * The one place that turns "this person earned or was given access" into unlocked enrolments, and back.
 * Everything that grants access (referral threshold, unlock code, staff) goes through here.
 */
export function createAccessService(deps: AccessDeps) {
  const { entitlements, unlockCodes, enrolments, audit } = deps;
  const now = deps.now ?? ((): Date => new Date());

  const record = (
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
      meta: { targetType: "user", ...meta },
    });

  /** Why this learner may open this course, or null when no active grant covers it. */
  async function resolve(userId: string, courseId: string): Promise<EntitlementVia | null> {
    const active = (await entitlements.listForUser(userId)).filter((e) => covers(e, courseId));
    for (const via of PRIORITY) if (active.some((e) => e.via === via)) return via;
    return null;
  }

  /** Brings the learner's enrolments in line with their grants. Safe to call any time. */
  async function apply(userId: string): Promise<void> {
    const grants = (await entitlements.listForUser(userId)).filter(
      (e) => e.revokedAt === undefined,
    );
    for (const enrolment of await enrolments.listForUser(userId)) {
      if (enrolment.status === "withdrawn") continue;
      const via = PRIORITY.find((v) =>
        grants.some((g) => g.via === v && covers(g, enrolment.courseId)),
      );
      if (via !== undefined && enrolment.access.state === "locked")
        await enrolments.unlock(enrolment.id, via, now());
      // Only grant-based unlocks are taken back; open courses and legacy rows stay unlocked.
      else if (
        via === undefined &&
        enrolment.access.state === "unlocked" &&
        enrolment.access.via !== undefined &&
        enrolment.access.via !== "open"
      ) {
        await enrolments.lock(enrolment.id);
      }
    }
  }

  return {
    resolve,
    apply,

    async grant(
      userId: string,
      scope: EntitlementScope,
      via: EntitlementVia,
      opts: { sourceId?: string; grantedBy?: string; note?: string; ctx?: RequestContext } = {},
    ) {
      const { entitlement, created } = await entitlements.grant({
        userId,
        scope,
        via,
        sourceId: opts.sourceId,
        grantedBy: opts.grantedBy,
        note: opts.note,
        grantedAt: now(),
      });
      if (created)
        await record("access.unlocked", opts.grantedBy ?? userId, opts.ctx, {
          targetId: userId,
          detail: `${via}:${scope.type}`,
        });
      await apply(userId);
      return entitlement;
    },

    /** Revokes every active grant of one kind (and optional source), e.g. referral credit that no longer holds. */
    async revokeVia(
      userId: string,
      via: EntitlementVia,
      by?: string,
      ctx?: RequestContext,
    ): Promise<number> {
      const active = (await entitlements.listForUser(userId)).filter(
        (e) => e.via === via && e.revokedAt === undefined,
      );
      for (const e of active) await entitlements.revoke(e.id, now(), by);
      if (active.length > 0) {
        await record("access.revoked", by ?? userId, ctx, { targetId: userId, detail: via });
        await apply(userId);
      }
      return active.length;
    },

    async revokeEntitlement(id: string, by: string, ctx: RequestContext): Promise<void> {
      const e = await entitlements.findById(id);
      if (e === null) throw new AppError(404, "NOT_FOUND", "Resource not found.");
      await entitlements.revoke(id, now(), by);
      await record("access.revoked", by, ctx, {
        targetId: e.userId,
        detail: `${e.via}:${e.scope.type}`,
      });
      await apply(e.userId);
    },

    listForUser: (userId: string) => entitlements.listForUser(userId),

    /**
     * Learner enters an ambassador, partner or promo code. Every failure looks the same, so the endpoint
     * cannot be used to discover which codes exist or why one does not work.
     */
    async redeem(userId: string, rawCode: string, ctx: RequestContext): Promise<void> {
      const code = await unlockCodes.findByCode(rawCode.trim());
      if (code === null) throw invalidCode();
      const outcome = await unlockCodes.redeem(code.id, userId, now());
      if (outcome === "exhausted" || outcome === "expired" || outcome === "inactive")
        throw invalidCode();
      const scopes: EntitlementScope[] =
        code.courseIds.length === 0
          ? [{ type: "all" }]
          : code.courseIds.map((courseId) => ({ type: "course", courseId }));
      // "already" still re-applies the grants, so a learner who redeemed before enrolling is not stuck.
      for (const scope of scopes)
        await this.grant(userId, scope, "code", { sourceId: code.id, ctx });
      if (outcome === "ok")
        await record("code.redeem", userId, ctx, { targetId: userId, detail: code.kind });
    },
  };
}
export type AccessService = ReturnType<typeof createAccessService>;
