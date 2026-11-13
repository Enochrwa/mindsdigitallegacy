import { describe, expect, it } from "vitest";
import { createPasswordHasher } from "./password.js";
import { checkPassword } from "./passwordPolicy.js";
import { generateToken, hashToken, ipPrefix } from "./tokens.js";

const fast = createPasswordHasher({ memoryKiB: 64, passes: 1, parallelism: 1 });

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await fast.hash("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=64,t=1,p=1\$/);
    expect(await fast.verify("correct horse battery", hash)).toBe(true);
    expect(await fast.verify("wrong", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await fast.hash("same")).not.toBe(await fast.hash("same"));
  });

  it("returns false (not an exception) for malformed or oversized parameters", async () => {
    expect(await fast.verify("x", "not-a-hash")).toBe(false);
    expect(await fast.verify("x", "$argon2id$v=19$m=99999999,t=2,p=1$AAAA$AAAA")).toBe(false);
  });
});

describe("password policy", () => {
  const ctx = { email: "ada.uwase@example.rw", displayName: "Ada Uwase" };
  it.each([
    ["short", "at least"],
    ["password123", "common"],
    ["aaaaaaaaaaaa", "repetitive"],
    ["xx ada.uwase xx!", "email"],
    ["my AdaUwase pass", "name"],
  ])("rejects %s", (password, reason) => {
    expect(checkPassword(password, ctx)).toContain(reason);
  });
  it("accepts a long passphrase without composition rules", () => {
    expect(checkPassword("correct horse battery", ctx)).toBeUndefined();
  });
});

describe("tokens", () => {
  it("generates 256-bit unique tokens and hashes deterministically", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(generateToken());
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("truncates IPs to coarse prefixes", () => {
    expect(ipPrefix("196.12.34.56")).toBe("196.12.34.0");
    expect(ipPrefix("::ffff:196.12.34.56")).toBe("196.12.34.0");
    expect(ipPrefix("2001:db8:abcd:1::1")).toBe("2001:db8:abcd::");
    expect(ipPrefix(undefined)).toBe("unknown");
  });
});
