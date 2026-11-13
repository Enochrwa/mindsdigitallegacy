import { describe, expect, it } from "vitest";
import { authorize } from "./policy.js";

describe("authorize (deny by default)", () => {
  const alice = { id: "alice", roles: ["learner"] as const };

  it("allows own data", () => {
    expect(authorize(alice, "profile:read", { ownerId: "alice" })).toBe(true);
    expect(authorize(alice, "profile:delete", { ownerId: "alice" })).toBe(true);
  });

  it("denies another user's data for every action (IDOR)", () => {
    for (const action of [
      "profile:read",
      "profile:update",
      "profile:export",
      "profile:delete",
    ] as const) {
      expect(authorize(alice, action, { ownerId: "bob" })).toBe(false);
    }
  });

  it("denies unauthenticated callers and even admins by default", () => {
    expect(authorize(undefined, "profile:read", { ownerId: "alice" })).toBe(false);
    expect(authorize({ id: "root", roles: ["admin"] }, "profile:read", { ownerId: "alice" })).toBe(
      false,
    );
  });
});
