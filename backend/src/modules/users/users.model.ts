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
    passwordHash: { type: String, required: true, select: false },
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
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ deletedAt: 1 }, { sparse: true });

export const UserModel = model("User", userSchema);
