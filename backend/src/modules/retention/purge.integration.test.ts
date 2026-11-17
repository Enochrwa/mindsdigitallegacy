import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EntitlementModel, RedemptionModel } from "../access/access.model.js";
import { AuthTokenModel } from "../auth/authTokens.js";
import { EnrolmentModel, ProgressModel } from "../courses/courses.model.js";
import {
  ReferralCodeModel,
  ReferralEventModel,
  ReferralModel,
} from "../referrals/referrals.model.js";
import { SessionModel } from "../sessions/sessions.model.js";
import { UserModel } from "../users/users.model.js";
import { createMongoUserRepository } from "../users/users.mongo.js";
import type { NewUser } from "../users/users.types.js";
import { createMongoPurgeStore } from "./purge.mongo.js";

/** Runs against a real MongoDB when MONGODB_TEST_URI is set (CI service container). Skipped otherwise. */
const uri = process.env["MONGODB_TEST_URI"];

const newUser = (email: string): NewUser => ({
  email,
  passwordHash: "hash",
  displayName: "Test User",
  roles: ["learner"],
  ageBracket: "16_plus",
  consents: [{ type: "service", noticeVersion: "2026-11", at: new Date() }],
  guardian: undefined,
  emailVerifiedAt: undefined,
  phone: undefined,
  lockedUntil: undefined,
  deletedAt: undefined,
});

const DAY = 86_400_000;
const later = new Date(Date.now() + 365 * DAY);

describe.skipIf(uri === undefined)("account purge (integration)", () => {
  const users = createMongoUserRepository();
  const store = createMongoPurgeStore();

  beforeAll(async () => {
    mongoose.set("sanitizeFilter", true);
    await mongoose.connect(uri as string, { dbName: `mdl_purge_${Date.now()}` });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  async function withData(email: string) {
    const user = await users.create(newUser(email));
    const userId = new Types.ObjectId(user.id);
    const courseId = new Types.ObjectId();
    const lessonId = new Types.ObjectId();
    const now = new Date();
    await SessionModel.create({
      userId,
      tokenHash: `t-${email}`,
      family: "f",
      lastUsedAt: now,
      expiresAt: later,
      absoluteExpiresAt: later,
    });
    await AuthTokenModel.create({
      userId,
      purpose: "verify_email",
      tokenHash: `a-${email}`,
      expiresAt: later,
    });
    await EnrolmentModel.create({
      userId,
      courseId,
      status: "active",
      access: { state: "locked" },
      enrolledAt: now,
      lastActivityAt: now,
    });
    await ProgressModel.create({
      userId,
      courseId,
      lessonId,
      status: "in_progress",
      firstStartedAt: now,
      lastActivityAt: now,
    });
    await EntitlementModel.create({
      userId,
      scope: { type: "all" },
      via: "admin",
      grantedAt: now,
    });
    await RedemptionModel.create({ codeId: new Types.ObjectId(), userId, at: now });
    await ReferralCodeModel.create({ userId, code: `C${email.slice(0, 6).toUpperCase()}X` });
    await ReferralEventModel.create({
      at: now,
      type: "visit",
      referrerId: userId,
      inviteeId: new Types.ObjectId(),
    });
    return { user, userId };
  }

  it("removes a soft-deleted account's data and keeps other people's", async () => {
    const gone = await withData("gone@example.rw");
    const stays = await withData("stays@example.rw");
    await users.softDelete(gone.user.id, new Date(Date.now() - 40 * DAY));

    const due = await store.findDeletedBefore(new Date(Date.now() - 30 * DAY), 10);
    expect(due).toEqual([gone.user.id]);

    const counts = await store.purgeUser(gone.user.id);
    expect(counts["users"]).toBe(1);

    const byGone = { userId: gone.userId };
    expect(await SessionModel.countDocuments(byGone)).toBe(0);
    expect(await AuthTokenModel.countDocuments(byGone)).toBe(0);
    expect(await EnrolmentModel.countDocuments(byGone)).toBe(0);
    expect(await ProgressModel.countDocuments(byGone)).toBe(0);
    expect(await EntitlementModel.countDocuments(byGone)).toBe(0);
    expect(await RedemptionModel.countDocuments(byGone)).toBe(0);
    expect(await ReferralCodeModel.countDocuments(byGone)).toBe(0);
    expect(await ReferralEventModel.countDocuments({ referrerId: gone.userId })).toBe(0);
    // The funnel event itself stays, only the person's id is gone.
    expect(await ReferralEventModel.countDocuments({ type: "visit" })).toBe(2);
    expect(await UserModel.countDocuments({ _id: gone.userId })).toBe(0);

    // The other learner is untouched.
    expect(await SessionModel.countDocuments({ userId: stays.userId })).toBe(1);
    expect(await UserModel.countDocuments({ _id: stays.userId })).toBe(1);
  });

  it("refuses to purge an account that is not soft-deleted", async () => {
    const active = await withData("active@example.rw");
    expect(await store.purgeUser(active.user.id)).toEqual({});
    expect(await UserModel.countDocuments({ _id: active.userId })).toBe(1);
    expect(await SessionModel.countDocuments({ userId: active.userId })).toBe(1);
  });

  it("is idempotent when run twice", async () => {
    const twice = await withData("twice@example.rw");
    await users.softDelete(twice.user.id, new Date(Date.now() - 40 * DAY));
    await store.purgeUser(twice.user.id);
    expect(await store.purgeUser(twice.user.id)).toEqual({});
  });

  it("removes the invitee's referral row but keeps rows where they were the referrer", async () => {
    const referrer = await withData("referrer@example.rw");
    const invitee = await withData("invitee@example.rw");
    const third = new Types.ObjectId();
    await ReferralModel.create({
      referrerId: referrer.userId,
      inviteeId: invitee.userId,
      code: "ABCDEFGH",
      status: "qualified",
      ipPrefix: "1.2.3",
      emailKey: "k1",
    });
    await ReferralModel.create({
      referrerId: invitee.userId,
      inviteeId: third,
      code: "HGFEDCBA",
      status: "pending",
      ipPrefix: "1.2.3",
      emailKey: "k2",
    });
    await users.softDelete(invitee.user.id, new Date(Date.now() - 40 * DAY));
    await store.purgeUser(invitee.user.id);

    expect(await ReferralModel.countDocuments({ inviteeId: invitee.userId })).toBe(0);
    expect(await ReferralModel.countDocuments({ inviteeId: third })).toBe(1);
  });
});
