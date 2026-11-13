import { AuthTokenModel } from "./authTokens.js";
import type { AuthTokenRepository } from "./authTokens.js";

export function createMongoAuthTokenRepository(): AuthTokenRepository {
  return {
    async create(input) {
      await AuthTokenModel.create(input);
    },
    async peek(purpose, tokenHash, now) {
      const doc = await AuthTokenModel.findOne({
        purpose,
        tokenHash,
        usedAt: { $exists: false },
        expiresAt: { $gt: now },
      }).lean();
      return doc === null ? null : String(doc.userId);
    },
    async consume(purpose, tokenHash, now) {
      // Single atomic update: of two concurrent requests with the same token, only one matches.
      const doc = await AuthTokenModel.findOneAndUpdate(
        { purpose, tokenHash, usedAt: { $exists: false }, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { returnDocument: "before" },
      ).lean();
      return doc === null ? null : String(doc.userId);
    },
  };
}
