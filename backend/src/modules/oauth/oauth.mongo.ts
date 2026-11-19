import { Types } from "mongoose";
import { OAuthIdentityModel } from "./oauth.model.js";
import type { OAuthIdentity, OAuthIdentityRepository } from "./oauth.repository.js";
import type { ProviderId } from "./oauth.types.js";

const valid = (id: string): boolean => Types.ObjectId.isValid(id);
const isDup = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && e.code === 11000;

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- lean documents are loosely typed; the mapper names every field */
const toIdentity = (d: any): OAuthIdentity => ({
  id: String(d._id),
  userId: String(d.userId),
  provider: d.provider as ProviderId,
  subject: d.subject,
  email: d.email ?? undefined,
  createdAt: d.createdAt,
  lastUsedAt: d.lastUsedAt,
});
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

export function createMongoOAuthIdentityRepository(): OAuthIdentityRepository {
  return {
    async findByProviderSubject(provider, subject) {
      const d = await OAuthIdentityModel.findOne({ provider, subject }).lean();
      return d === null ? null : toIdentity(d);
    },
    async listByUser(userId) {
      if (!valid(userId)) return [];
      const rows = await OAuthIdentityModel.find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: 1 })
        .limit(20)
        .lean();
      return rows.map(toIdentity);
    },
    async create(identity, now) {
      try {
        const d = await OAuthIdentityModel.create({
          userId: new Types.ObjectId(identity.userId),
          provider: identity.provider,
          subject: identity.subject,
          ...(identity.email === undefined ? {} : { email: identity.email }),
          lastUsedAt: now,
        });
        return toIdentity(d.toObject());
      } catch (err) {
        if (isDup(err)) throw new Error("DUPLICATE", { cause: err });
        throw err;
      }
    },
    async touch(id, at) {
      if (valid(id))
        await OAuthIdentityModel.updateOne(
          { _id: new Types.ObjectId(id) },
          { $set: { lastUsedAt: at } },
        );
    },
    async remove(userId, provider) {
      if (!valid(userId)) return false;
      const r = await OAuthIdentityModel.deleteOne({
        userId: new Types.ObjectId(userId),
        provider,
      });
      return r.deletedCount > 0;
    },
    async removeAllForUser(userId) {
      if (!valid(userId)) return 0;
      return (await OAuthIdentityModel.deleteMany({ userId: new Types.ObjectId(userId) }))
        .deletedCount;
    },
  };
}
