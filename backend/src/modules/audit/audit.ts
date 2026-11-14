import { Schema, model } from "mongoose";

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
  | "course.uncomplete";

export interface AuditEvent {
  at: Date;
  actorId?: string | undefined;
  action: AuditAction;
  requestId: string;
  ipPrefix: string;
  outcome: "success" | "failure";
  /** Small allow-listed object. Never request bodies, emails or tokens. */
  meta?:
    { reason?: string; consentType?: string; granted?: boolean; courseSlug?: string } | undefined;
}

/** Append-only by construction: the interface has no update or delete. */
export interface AuditLog {
  append(event: AuditEvent): Promise<void>;
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

export const AuditModel = model("AuditEvent", auditSchema);

export function createMongoAuditLog(): AuditLog {
  return {
    async append(event) {
      await AuditModel.create(event);
    },
  };
}
