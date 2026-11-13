import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoAuthTokenRepository } from "../auth/authTokens.mongo.js";
import { AuthTokenModel } from "../auth/authTokens.js";
import { SessionModel } from "../sessions/sessions.model.js";
import { createMongoSessionRepository } from "../sessions/sessions.mongo.js";
import { createMongoUserRepository } from "./users.mongo.js";
import { UserModel } from "./users.model.js";
import { DuplicateEmailError } from "./users.types.js";
import type { NewUser } from "./users.types.js";

/**
 * Runs against a real MongoDB when MONGODB_TEST_URI is set (CI provides a service container).
 * Skipped otherwise. Uses a throwaway database named per run and drops it afterwards.
 */
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

describe.skipIf(uri === undefined)("MongoDB repositories (integration)", () => {
  const users = createMongoUserRepository();
  const sessions = createMongoSessionRepository();
  const tokens = createMongoAuthTokenRepository();

  beforeAll(async () => {
    mongoose.set("sanitizeFilter", true);
    await mongoose.connect(uri as string, { dbName: `mdl_test_${Date.now()}` });
    await Promise.all([UserModel, SessionModel, AuthTokenModel].map((m) => m.syncIndexes()));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("enforces a unique, case-insensitive email", async () => {
    await users.create(newUser("Dup@Example.rw"));
    await expect(users.create(newUser("dup@example.rw"))).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it("loads the password hash only through the repository", async () => {
    const created = await users.create(newUser("hash@example.rw"));
    expect((await users.findById(created.id))?.passwordHash).toBe("hash");
    expect((await UserModel.findById(created.id).lean())?.["passwordHash"]).toBeUndefined();
  });

  it("increments failed logins atomically and clears state", async () => {
    const u = await users.create(newUser("lock@example.rw"));
    await Promise.all([1, 2, 3, 4, 5].map(() => users.incrementFailedLogins(u.id)));
    expect((await users.findById(u.id))?.failedLogins).toBe(5);
    await users.lockUntil(u.id, new Date(Date.now() + 60_000));
    await users.clearLoginState(u.id);
    const after = await users.findById(u.id);
    expect(after?.failedLogins).toBe(0);
    expect(after?.lockedUntil).toBeUndefined();
  });

  it("withdraws consent without touching other consent types", async () => {
    const u = await users.create(newUser("consent@example.rw"));
    await users.setConsent(u.id, "marketing", "2026-11", new Date(), true);
    await users.setConsent(u.id, "marketing", "2026-11", new Date(), false);
    const found = await users.findById(u.id);
    expect(found?.consents.find((c) => c.type === "marketing")?.withdrawnAt).toBeInstanceOf(Date);
    expect(found?.consents.find((c) => c.type === "service")?.withdrawnAt).toBeUndefined();
  });

  it("lets exactly one of many concurrent requests consume a token", async () => {
    const u = await users.create(newUser("token@example.rw"));
    await tokens.create({
      userId: u.id,
      purpose: "reset_password",
      tokenHash: "h".repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => tokens.consume("reset_password", "h".repeat(64), new Date())),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("does not consume expired tokens or tokens of another purpose", async () => {
    const u = await users.create(newUser("expired@example.rw"));
    await tokens.create({
      userId: u.id,
      purpose: "verify_email",
      tokenHash: "e".repeat(64),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await tokens.consume("verify_email", "e".repeat(64), new Date())).toBeNull();
    expect(await tokens.consume("reset_password", "e".repeat(64), new Date())).toBeNull();
  });

  it("revokes a whole session family", async () => {
    const u = await users.create(newUser("sess@example.rw"));
    const base = {
      userId: u.id,
      family: "fam-1",
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
      userAgentSummary: "",
      ipPrefix: "unknown",
    };
    await sessions.create({ ...base, tokenHash: "a".repeat(64) });
    await sessions.create({ ...base, tokenHash: "b".repeat(64) });
    await sessions.revokeFamily("fam-1");
    expect(await sessions.findByTokenHash("a".repeat(64))).toBeNull();
    expect(await sessions.findByTokenHash("b".repeat(64))).toBeNull();
  });

  it("has the TTL indexes in the database", async () => {
    const sessionIdx = await SessionModel.collection.indexes();
    expect(sessionIdx.some((i) => i.expireAfterSeconds === 0)).toBe(true);
  });
});
