import { Schema, model } from "mongoose";

export type TokenPurpose = "verify_email" | "reset_password" | "guardian_consent";

/** One-time tokens. Only hashes are stored. Consuming is atomic, so a token works exactly once. */
export interface AuthTokenRepository {
  create(input: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  /** Looks up an unused, unexpired token without spending it (to validate input before consuming). */
  peek(purpose: TokenPurpose, tokenHash: string, now: Date): Promise<string | null>;
  /** Returns the user id if the token is unused and unexpired, and marks it used in the same step. */
  consume(purpose: TokenPurpose, tokenHash: string, now: Date): Promise<string | null>;
}

export const authTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    purpose: {
      type: String,
      enum: ["verify_email", "reset_password", "guardian_consent"],
      required: true,
    },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

authTokenSchema.index({ tokenHash: 1 }, { unique: true });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthTokenModel = model("AuthToken", authTokenSchema);
