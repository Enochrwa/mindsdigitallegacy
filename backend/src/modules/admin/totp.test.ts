import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  createSecretBox,
  generateRecoveryCodes,
  hashRecoveryCode,
  hotp,
  verifyTotp,
} from "./totp.js";

// RFC 6238 appendix B uses the ASCII secret "12345678901234567890"; the 6-digit values are the last 6 of the 8-digit ones.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 test vectors", () => {
    const secret = base32Decode(RFC_SECRET);
    expect(hotp(secret, Math.floor(59 / 30))).toBe("287082");
    expect(hotp(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(hotp(secret, Math.floor(1234567890 / 30))).toBe("005924");
  });

  it("round-trips base32", () => {
    const bytes = Buffer.from("hello world, mdl");
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it("accepts the current step and one neighbour, rejects others, and refuses replays", () => {
    const at = new Date(1234567890 * 1000);
    expect(verifyTotp(RFC_SECRET, "005924", at)).toBe(Math.floor(1234567890 / 30));
    expect(verifyTotp(RFC_SECRET, "005924", new Date(at.getTime() + 30_000))).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, "005924", new Date(at.getTime() + 120_000))).toBeNull();
    expect(verifyTotp(RFC_SECRET, "000000", at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "005924", at, Math.floor(1234567890 / 30))).toBeNull();
  });

  it("seals secrets with authenticated encryption", () => {
    const box = createSecretBox("k".repeat(32));
    const sealed = box.seal("SECRET");
    expect(sealed).not.toContain("SECRET");
    expect(box.open(sealed)).toBe("SECRET");
    expect(() => createSecretBox("other".repeat(8)).open(sealed)).toThrow();
    expect(() => box.open(sealed.slice(0, -2) + "AA")).toThrow();
  });

  it("makes distinct recovery codes whose hash ignores dashes and case", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(hashRecoveryCode(codes[0] ?? "")).toBe(
      hashRecoveryCode((codes[0] ?? "").toLowerCase().replace("-", "")),
    );
  });
});
