import { SessionModel } from "./sessions.model.js";
import type { Session, SessionRepository } from "./sessions.types.js";

interface SessionDoc {
  _id: { toString(): string };
  userId: { toString(): string };
  tokenHash: string;
  family: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  rotatedAt?: Date | null;
  userAgentSummary: string;
  ipPrefix: string;
}

function toSession(doc: SessionDoc): Session {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    tokenHash: doc.tokenHash,
    family: doc.family,
    createdAt: doc.createdAt,
    lastUsedAt: doc.lastUsedAt,
    expiresAt: doc.expiresAt,
    absoluteExpiresAt: doc.absoluteExpiresAt,
    rotatedAt: doc.rotatedAt ?? undefined,
    userAgentSummary: doc.userAgentSummary,
    ipPrefix: doc.ipPrefix,
  };
}

export function createMongoSessionRepository(): SessionRepository {
  return {
    async create(session) {
      const doc = await SessionModel.create(session);
      return toSession(doc.toObject());
    },
    async findByTokenHash(tokenHash) {
      const doc = await SessionModel.findOne({ tokenHash }).lean();
      return doc === null ? null : toSession(doc);
    },
    async markRotated(id, at) {
      await SessionModel.updateOne({ _id: id }, { $set: { rotatedAt: at } });
    },
    async touch(id, lastUsedAt, expiresAt) {
      await SessionModel.updateOne({ _id: id }, { $set: { lastUsedAt, expiresAt } });
    },
    async revokeFamily(family) {
      await SessionModel.deleteMany({ family });
    },
    async revokeAllForUser(userId, exceptFamily) {
      await SessionModel.deleteMany({
        userId,
        ...(exceptFamily === undefined ? {} : { family: { $ne: exceptFamily } }),
      });
    },
  };
}
