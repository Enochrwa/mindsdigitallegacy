import { describe, expect, it } from "vitest";
import { AuditModel } from "../audit/audit.js";
import { AuthTokenModel } from "../auth/authTokens.js";
import { SessionModel } from "../sessions/sessions.model.js";
import { UserModel } from "./users.model.js";

/** No database: schema validation and index definitions only. Behaviour is in the integration test. */

const hasIndex = (model: { schema: { indexes(): unknown[] } }, key: string, option?: string) =>
  model.schema.indexes().some((entry) => {
    const [spec, opts] = entry as [Record<string, unknown>, Record<string, unknown>];
    return key in spec && (option === undefined || opts[option] !== undefined);
  });

describe("User model", () => {
  const valid = {
    email: "Ada@Example.rw",
    passwordHash: "h",
    displayName: "Ada",
    ageBracket: "16_plus",
  };

  it("lower-cases email, defaults to the learner role, and rejects unknown roles", async () => {
    const doc = new UserModel(valid);
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.email).toBe("ada@example.rw");
    expect(doc.roles).toEqual(["learner"]);
    await expect(new UserModel({ ...valid, roles: ["superuser"] }).validate()).rejects.toThrow();
  });

  it("never selects the password hash by default and has a unique email index", () => {
    expect(UserModel.schema.path("passwordHash").options["select"]).toBe(false);
    expect(hasIndex(UserModel, "email", "unique")).toBe(true);
  });
});

describe("Session, token and audit models", () => {
  it("expire sessions and tokens automatically (TTL) and index hashes uniquely", () => {
    expect(hasIndex(SessionModel, "expiresAt", "expireAfterSeconds")).toBe(true);
    expect(hasIndex(SessionModel, "tokenHash", "unique")).toBe(true);
    expect(hasIndex(AuthTokenModel, "expiresAt", "expireAfterSeconds")).toBe(true);
    expect(hasIndex(AuthTokenModel, "tokenHash", "unique")).toBe(true);
  });

  it("requires the fields an audit event needs", async () => {
    await expect(new AuditModel({}).validate()).rejects.toThrow(/action/);
  });
});
