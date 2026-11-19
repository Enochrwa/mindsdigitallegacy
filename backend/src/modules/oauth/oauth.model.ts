import { Schema, model } from "mongoose";
import { PROVIDER_IDS } from "./oauth.types.js";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    provider: { type: String, enum: PROVIDER_IDS, required: true },
    subject: { type: String, required: true, maxlength: 200 },
    email: { type: String, maxlength: 254 },
    lastUsedAt: { type: Date, required: true },
  },
  { versionKey: false, strict: "throw", timestamps: true },
);
// One MDL account per provider account, and one account per provider for each person.
schema.index({ provider: 1, subject: 1 }, { unique: true });
schema.index({ userId: 1, provider: 1 }, { unique: true });

export const OAuthIdentityModel = model("OAuthIdentity", schema);
