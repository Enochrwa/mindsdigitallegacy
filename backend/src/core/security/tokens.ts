import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque random tokens (session ids, email verification, password reset, guardian consent).
 * 256 bits from the OS CSPRNG. Only the SHA-256 hash is ever stored, so a database leak does not
 * hand out usable tokens. SHA-256 (not a slow hash) is correct here because the input is already
 * high-entropy and unguessable.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Coarse network prefix for audit and session records: /24 for IPv4, first 3 groups for IPv6. */
export function ipPrefix(ip: string | undefined): string {
  if (ip === undefined || ip === "") return "unknown";
  const v4 = ip.replace(/^::ffff:/, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return `${v4.split(".").slice(0, 3).join(".")}.0`;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}::`;
  return "unknown";
}
