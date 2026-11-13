import { describe, expect, it } from "vitest";
import { findUnsafeStructure } from "./rejectUnsafeKeys.js";

describe("findUnsafeStructure", () => {
  it("accepts ordinary nested data", () => {
    expect(findUnsafeStructure({ a: 1, b: { c: ["x", { d: true }] }, e: null })).toBeNull();
  });

  it("accepts primitives and null", () => {
    expect(findUnsafeStructure("text")).toBeNull();
    expect(findUnsafeStructure(null)).toBeNull();
    expect(findUnsafeStructure(undefined)).toBeNull();
  });

  it.each(["$ne", "$gt", "$where", "$regex"])("rejects the operator key %s", (key) => {
    expect(findUnsafeStructure({ email: { [key]: "" } })).toBe("forbidden_key");
  });

  it("rejects dotted keys", () => {
    expect(findUnsafeStructure({ "profile.role": "admin" })).toBe("forbidden_key");
  });

  it("rejects prototype-pollution keys, including from JSON.parse", () => {
    const parsed: unknown = JSON.parse('{"__proto__":{"isAdmin":true}}');
    expect(findUnsafeStructure(parsed)).toBe("forbidden_key");
    expect(findUnsafeStructure({ constructor: { prototype: {} } })).toBe("forbidden_key");
  });

  it("finds unsafe keys inside arrays of objects", () => {
    expect(findUnsafeStructure({ items: [{ ok: 1 }, { $or: [] }] })).toBe("forbidden_key");
  });

  it("rejects bodies nested too deeply", () => {
    let deep: Record<string, unknown> = {};
    for (let i = 0; i < 20; i += 1) deep = { n: deep };
    expect(findUnsafeStructure(deep)).toBe("too_deep");
  });

  it("rejects bodies with too many nodes", () => {
    const wide = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`k${i}`, i]));
    expect(findUnsafeStructure(wide)).toBe("too_large");
  });
});
