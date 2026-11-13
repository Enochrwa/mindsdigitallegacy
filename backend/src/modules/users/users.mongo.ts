import type { UserRepository } from "./users.repository.js";
import { UserModel } from "./users.model.js";
import { DuplicateEmailError } from "./users.types.js";
import type { Consent, Role, User } from "./users.types.js";

interface UserDoc {
  _id: { toString(): string };
  email: string;
  emailVerifiedAt?: Date | null;
  passwordHash?: string;
  displayName: string;
  phone?: string | null;
  roles: Role[];
  ageBracket: "under_16" | "16_plus";
  guardian?: { email?: string | null; consentAt?: Date | null; method?: string | null } | null;
  consents?: Consent[];
  failedLogins?: number;
  lockedUntil?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
}

function toUser(doc: UserDoc): User {
  const guardianEmail = doc.guardian?.email;
  return {
    id: doc._id.toString(),
    email: doc.email,
    emailVerifiedAt: doc.emailVerifiedAt ?? undefined,
    passwordHash: doc.passwordHash ?? "",
    displayName: doc.displayName,
    phone: doc.phone ?? undefined,
    roles: doc.roles,
    ageBracket: doc.ageBracket,
    guardian:
      guardianEmail === undefined || guardianEmail === null
        ? undefined
        : {
            email: guardianEmail,
            consentAt: doc.guardian?.consentAt ?? undefined,
            method: doc.guardian?.method ?? undefined,
          },
    consents: (doc.consents ?? []).map((c) => ({
      type: c.type,
      noticeVersion: c.noticeVersion,
      at: c.at,
      withdrawnAt: c.withdrawnAt ?? undefined,
    })),
    failedLogins: doc.failedLogins ?? 0,
    lockedUntil: doc.lockedUntil ?? undefined,
    deletedAt: doc.deletedAt ?? undefined,
    createdAt: doc.createdAt,
  };
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === 11000;
}

export function createMongoUserRepository(): UserRepository {
  const withHash = "+passwordHash";
  return {
    async create(user) {
      try {
        const doc = await UserModel.create(user);
        return toUser(doc.toObject() as unknown as UserDoc);
      } catch (err) {
        if (isDuplicateKey(err)) throw new DuplicateEmailError();
        throw err;
      }
    },
    async findByEmail(email) {
      const doc = await UserModel.findOne({ email: email.toLowerCase() }).select(withHash).lean();
      return doc === null ? null : toUser(doc as unknown as UserDoc);
    },
    async findById(id) {
      const doc = await UserModel.findById(id).select(withHash).lean();
      return doc === null ? null : toUser(doc as unknown as UserDoc);
    },
    async markEmailVerified(id, at) {
      await UserModel.updateOne({ _id: id }, { $set: { emailVerifiedAt: at } });
    },
    async recordGuardianConsent(id, at, method) {
      await UserModel.updateOne(
        { _id: id },
        { $set: { "guardian.consentAt": at, "guardian.method": method } },
      );
    },
    async setPasswordHash(id, passwordHash) {
      await UserModel.updateOne({ _id: id }, { $set: { passwordHash } });
    },
    async incrementFailedLogins(id) {
      const doc = await UserModel.findOneAndUpdate(
        { _id: id },
        { $inc: { failedLogins: 1 } },
        { returnDocument: "after" },
      ).lean();
      return doc?.failedLogins ?? 1;
    },
    async lockUntil(id, until) {
      await UserModel.updateOne({ _id: id }, { $set: { lockedUntil: until } });
    },
    async clearLoginState(id) {
      await UserModel.updateOne(
        { _id: id },
        { $set: { failedLogins: 0 }, $unset: { lockedUntil: 1 } },
      );
    },
    async setConsent(id, type, noticeVersion, at, granted) {
      if (granted) {
        await UserModel.updateOne(
          { _id: id },
          { $push: { consents: { type, noticeVersion, at } } },
        );
      } else {
        // Withdraw every open consent of this type.
        await UserModel.updateOne(
          { _id: id },
          { $set: { "consents.$[open].withdrawnAt": at } },
          { arrayFilters: [{ "open.type": type, "open.withdrawnAt": { $exists: false } }] },
        );
      }
    },
    async softDelete(id, at) {
      await UserModel.updateOne({ _id: id }, { $set: { deletedAt: at } });
    },
  };
}
