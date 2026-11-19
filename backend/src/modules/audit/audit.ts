import { Schema, model, trusted } from "mongoose";
import { escapeRegex } from "../../core/page.js";
import type { Page, PageRequest } from "../../core/page.js";

export type AuditAction =
  | "auth.register"
  | "auth.verify_email"
  | "auth.guardian_consent"
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.password_reset.request"
  | "auth.password_reset.complete"
  | "auth.session.reuse_detected"
  | "user.consent.update"
  | "user.export"
  | "user.delete"
  | "course.enrol"
  | "course.withdraw"
  | "course.complete"
  | "course.uncomplete"
  | "referral.visit"
  | "referral.attributed"
  | "referral.qualified"
  | "referral.rejected"
  | "referral.revoked"
  | "referral.approved"
  | "access.unlocked"
  | "access.revoked"
  | "code.redeem"
  | "admin.mfa.setup"
  | "admin.mfa.enable"
  | "admin.mfa.verify"
  | "admin.mfa.recovery_used"
  | "admin.mfa.reset"
  | "admin.user.roles"
  | "admin.user.suspend"
  | "admin.user.unsuspend"
  | "admin.user.sessions_revoked"
  | "admin.course.create"
  | "admin.course.update"
  | "admin.lesson.create"
  | "admin.lesson.update"
  | "admin.category.update"
  | "admin.lead.update"
  | "admin.lead.delete"
  | "admin.unlock_code.create"
  | "admin.unlock_code.update"
  | "admin.enrolment.access"
  | "admin.settings.update"
  | "admin.export"
  | "internship.apply"
  | "internship.withdraw"
  | "internship.accept"
  | "internship.feedback"
  | "admin.internship.posting.create"
  | "admin.internship.posting.update"
  | "admin.internship.posting.publish"
  | "admin.internship.posting.close"
  | "admin.internship.application.transition"
  | "admin.internship.application.note"
  | "admin.internship.guardian.verify"
  | "admin.internship.placement.create"
  | "admin.internship.placement.end"
  | "admin.internship.placement.reassign"
  | "auth.oauth.login"
  | "auth.oauth.signup"
  | "auth.oauth.link"
  | "auth.oauth.unlink"
  | "auth.oauth.failure"
  | "system.account.purge";

export interface AuditEvent {
  at: Date;
  actorId?: string | undefined;
  action: AuditAction;
  requestId: string;
  ipPrefix: string;
  outcome: "success" | "failure";
  /** Small allow-listed object. Never request bodies, emails or tokens. */
  meta?: AuditMeta | undefined;
}

/** What an event may carry. Facts about the target, never personal content (no emails, no message text). */
export interface AuditMeta {
  reason?: string;
  consentType?: string;
  granted?: boolean;
  courseSlug?: string;
  targetType?: string;
  targetId?: string;
  /** Short, human-readable summary such as "roles: learner -> editor". */
  detail?: string;
}

export interface AuditQuery extends PageRequest {
  action?: string | undefined;
  actorId?: string | undefined;
  targetId?: string | undefined;
  outcome?: "success" | "failure" | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export type StoredAuditEvent = AuditEvent & { id: string };

/** Append-only by construction: the interface has no update or delete. */
export interface AuditLog {
  append(event: AuditEvent): Promise<void>;
  /** Read side for the admin console. Newest first. */
  list(query: AuditQuery): Promise<Page<StoredAuditEvent>>;
}

const auditSchema = new Schema(
  {
    at: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId },
    action: { type: String, required: true, maxlength: 60 },
    requestId: { type: String, required: true, maxlength: 80 },
    ipPrefix: { type: String, required: true, maxlength: 60 },
    outcome: { type: String, enum: ["success", "failure"], required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { versionKey: false },
);
auditSchema.index({ at: -1 });
auditSchema.index({ actorId: 1, at: -1 });
auditSchema.index({ action: 1, at: -1 });
auditSchema.index({ "meta.targetId": 1, at: -1 });

export const AuditModel = model("AuditEvent", auditSchema);

export function createMongoAuditLog(): AuditLog {
  return {
    async append(event) {
      await AuditModel.create(event);
    },
    async list({ action, actorId, targetId, outcome, from, to, page, pageSize }) {
      const filter: Record<string, unknown> = {};
      if (action !== undefined)
        filter["action"] = action.endsWith("*")
          ? new RegExp(`^${escapeRegex(action.slice(0, -1))}`)
          : action;
      if (actorId !== undefined) filter["actorId"] = actorId;
      if (targetId !== undefined) filter["meta.targetId"] = targetId;
      if (outcome !== undefined) filter["outcome"] = outcome;
      if (from !== undefined || to !== undefined) {
        filter["at"] = trusted({ ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) });
      }
      const [docs, total] = await Promise.all([
        AuditModel.find(filter)
          .sort({ at: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        AuditModel.countDocuments(filter),
      ]);
      const items = docs.map((d) => ({
        id: String(d._id),
        at: d.at,
        actorId: d.actorId === undefined || d.actorId === null ? undefined : String(d.actorId),
        action: d.action as AuditAction,
        requestId: d.requestId,
        ipPrefix: d.ipPrefix,
        outcome: d.outcome,
        meta: (d.meta ?? undefined) as AuditMeta | undefined,
      }));
      return { items, total, page, pageSize };
    },
  };
}
