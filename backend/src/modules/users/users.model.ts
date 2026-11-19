import { Schema, model } from "mongoose";
import { ROLES } from "./users.types.js";

/** `passwordHash` is never selected by default; repositories opt in explicitly. */
const consentSchema = new Schema(
  {
    type: { type: String, enum: ["service", "marketing"], required: true },
    noticeVersion: { type: String, required: true, maxlength: 20 },
    at: { type: Date, required: true },
    withdrawnAt: { type: Date },
  },
  { _id: false },
);

export const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    emailVerifiedAt: { type: Date },
    // Empty means "no password": the person signs in with a provider (Google, GitHub...) and may add one later.
    passwordHash: { type: String, default: "", select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 20 },
    roles: { type: [{ type: String, enum: ROLES }], default: ["learner"] },
    ageBracket: { type: String, enum: ["under_16", "16_plus"], required: true },
    guardian: {
      email: { type: String, trim: true, lowercase: true, maxlength: 254 },
      consentAt: { type: Date },
      method: { type: String, maxlength: 40 },
    },
    consents: { type: [consentSchema], default: [] },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    deletedAt: { type: Date },
    suspendedAt: { type: Date },
    suspendedReason: { type: String, maxlength: 200 },
    totp: {
      secretEnc: { type: String, maxlength: 400 },
      enabledAt: { type: Date },
      recoveryHashes: { type: [String], default: undefined },
      lastStep: { type: Number },
    },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ deletedAt: 1 }, { sparse: true });
userSchema.index({ roles: 1 });
userSchema.index({ createdAt: -1 });

export const UserModel = model("User", userSchema);
