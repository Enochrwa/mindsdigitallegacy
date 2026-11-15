import { Schema, model } from "mongoose";
import { REFERRAL_EVENT_TYPES, REFERRAL_STATUSES, REJECT_REASONS } from "./referrals.types.js";

const codeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    code: { type: String, required: true, uppercase: true, minlength: 6, maxlength: 12 },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    assignedThreshold: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw" },
);
codeSchema.index({ userId: 1 }, { unique: true });
codeSchema.index({ code: 1 }, { unique: true });
export const ReferralCodeModel = model("ReferralCode", codeSchema);

const referralSchema = new Schema(
  {
    referrerId: { type: Schema.Types.ObjectId, required: true },
    inviteeId: { type: Schema.Types.ObjectId, required: true },
    code: { type: String, required: true },
    status: { type: String, enum: REFERRAL_STATUSES, required: true },
    reason: { type: String, enum: REJECT_REASONS },
    ipPrefix: { type: String, required: true, maxlength: 60 },
    emailKey: { type: String, required: true, maxlength: 64 },
    qualifiedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw" },
);
// One person can be invited once: the first valid link wins.
referralSchema.index({ inviteeId: 1 }, { unique: true });
referralSchema.index({ referrerId: 1, status: 1 });
referralSchema.index({ status: 1, createdAt: -1 });
referralSchema.index({ code: 1, createdAt: -1 });
referralSchema.index({ emailKey: 1 });
export const ReferralModel = model("Referral", referralSchema);

const eventSchema = new Schema(
  {
    at: { type: Date, required: true },
    type: { type: String, enum: REFERRAL_EVENT_TYPES, required: true },
    code: { type: String },
    referrerId: { type: Schema.Types.ObjectId },
    inviteeId: { type: Schema.Types.ObjectId },
    reason: { type: String, enum: REJECT_REASONS },
    variant: { type: Number },
  },
  { versionKey: false, strict: "throw" },
);
eventSchema.index({ at: -1 });
eventSchema.index({ type: 1, at: -1 });
export const ReferralEventModel = model("ReferralEvent", eventSchema);
