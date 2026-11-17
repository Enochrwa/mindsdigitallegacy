import { createHmac } from "node:crypto";

/** The seeded dev administrator (backend/src/testing/devServer.ts). Development only. */
export const DEV_ADMIN = {
  email: "admin@example.rw",
  password: "correct horse battery",
  totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of input.replace(/=+$/, "").toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 code (HMAC-SHA1, 6 digits, 30 s) for the given base32 secret. */
export function totpNow(secret: string, at: Date = new Date()): string {
  const counter = Math.floor(at.getTime() / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const code =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return String(code % 1_000_000).padStart(6, "0");
}
