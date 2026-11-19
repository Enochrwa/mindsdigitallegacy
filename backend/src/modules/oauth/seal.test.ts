import { describe, expect, it } from "vitest";
import { createSealer } from "./seal.js";

const SECRET = "test-secret-that-is-at-least-32-characters-long!";

describe("sealed values", () => {
  it("round-trips a payload and adds an expiry", () => {
    const s = createSealer(SECRET);
    const value = s.seal("oauth-state", { a: 1, b: "x" }, 60_000);
    expect(s.unseal<{ a: number; b: string }>("oauth-state", value)).toMatchObject({
      a: 1,
      b: "x",
    });
  });

  it("never exposes the payload in the cookie text", () => {
    const s = createSealer(SECRET);
    const value = s.seal("oauth-state", { verifier: "SECRETVERIFIER123" }, 60_000);
    expect(value).not.toContain("SECRETVERIFIER");
    expect(Buffer.from(value, "base64url").toString("utf8")).not.toContain("SECRETVERIFIER");
  });

  it("rejects a value after it expires", () => {
    let t = 1_000_000;
    const s = createSealer(SECRET, () => t);
    const value = s.seal("oauth-state", { a: 1 }, 1000);
    t += 999;
    expect(s.unseal("oauth-state", value)).not.toBeNull();
    t += 2;
    expect(s.unseal("oauth-state", value)).toBeNull();
  });

  it("rejects a value sealed for another purpose", () => {
    const s = createSealer(SECRET);
    const value = s.seal("oauth-state", { a: 1 }, 60_000);
    expect(s.unseal("oauth-signup", value)).toBeNull();
  });

  it("rejects tampering, truncation, other keys, and junk", () => {
    const s = createSealer(SECRET);
    const value = s.seal("oauth-state", { a: 1 }, 60_000);
    const flipped = value.slice(0, 30) + (value[30] === "A" ? "B" : "A") + value.slice(31);
    expect(s.unseal("oauth-state", flipped)).toBeNull();
    expect(s.unseal("oauth-state", value.slice(0, -4))).toBeNull();
    expect(
      createSealer("another-secret-that-is-also-32-characters!!").unseal("oauth-state", value),
    ).toBeNull();
    for (const junk of [undefined, "", "short", "not base64 !!".repeat(10), "A".repeat(5000)]) {
      expect(s.unseal("oauth-state", junk)).toBeNull();
    }
  });

  it("seals the same payload differently each time", () => {
    const s = createSealer(SECRET);
    expect(s.seal("oauth-state", { a: 1 }, 1000)).not.toBe(s.seal("oauth-state", { a: 1 }, 1000));
  });
});
