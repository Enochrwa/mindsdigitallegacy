import { Schema, model } from "mongoose";

export const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    family: { type: String, required: true },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    rotatedAt: { type: Date },
    userAgentSummary: { type: String, maxlength: 80, default: "" },
    ipPrefix: { type: String, maxlength: 60, default: "unknown" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ family: 1 });
// Sessions delete themselves after expiry.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model("Session", sessionSchema);
