import { Schema, model } from "mongoose";

const scopeSchema = new Schema(
  {
    type: { type: String, enum: ["all", "course"], required: true },
    courseId: { type: Schema.Types.ObjectId },
  },
  { _id: false, strict: "throw" },
);

const entitlementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    scope: { type: scopeSchema, required: true },
    via: { type: String, enum: ["referral", "code", "admin"], required: true },
    sourceId: { type: String, maxlength: 40 },
    grantedBy: { type: Schema.Types.ObjectId },
    note: { type: String, maxlength: 300 },
    grantedAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId },
  },
  { versionKey: false, strict: "throw" },
);
entitlementSchema.index({ userId: 1, revokedAt: 1 });
export const EntitlementModel = model("Entitlement", entitlementSchema);

const unlockCodeSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, minlength: 4, maxlength: 24 },
    kind: { type: String, enum: ["ambassador", "partner", "promo"], required: true },
    label: { type: String, required: true, maxlength: 120 },
    maxUses: { type: Number, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    courseIds: { type: [Schema.Types.ObjectId], default: [] },
    createdBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw" },
);
unlockCodeSchema.index({ code: 1 }, { unique: true });
export const UnlockCodeModel = model("UnlockCode", unlockCodeSchema);

const redemptionSchema = new Schema(
  {
    codeId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    at: { type: Date, required: true },
  },
  { versionKey: false, strict: "throw" },
);
redemptionSchema.index({ codeId: 1, userId: 1 }, { unique: true });
export const RedemptionModel = model("UnlockRedemption", redemptionSchema);
