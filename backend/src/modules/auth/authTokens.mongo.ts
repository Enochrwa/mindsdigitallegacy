import { trusted } from "mongoose";
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
        usedAt: trusted({ $exists: false }),
        expiresAt: trusted({ $gt: now }),
      }).lean();
      return doc === null ? null : String(doc.userId);
    },
    async consume(purpose, tokenHash, now) {
      // Single atomic update: of two concurrent requests with the same token, only one matches.
      const doc = await AuthTokenModel.findOneAndUpdate(
        {
          purpose,
          tokenHash,
          usedAt: trusted({ $exists: false }),
          expiresAt: trusted({ $gt: now }),
        },
        { $set: { usedAt: now } },
        { returnDocument: "before" },
      ).lean();
      return doc === null ? null : String(doc.userId);
    },
  };
}
