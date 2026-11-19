import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Sealed, short-lived, tamper-proof values for cookies (AES-256-GCM). The sign-in "state" and the half-finished
 * sign-up live in the visitor's own browser, so the server keeps nothing and no database row can be abused.
 *
 * A sealed value carries its own expiry and a purpose label. The label is bound as authenticated data, so a
 * value sealed for one purpose (the sign-in state) can never be replayed as another (the pending sign-up).
 */

export type SealPurpose = "oauth-state" | "oauth-signup";

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "mdl-oauth-seal", "v1", 32));
}

export interface Sealer {
  seal(purpose: SealPurpose, payload: Record<string, unknown>, ttlMs: number): string;
  /** Returns the payload, or null for anything wrong: tampered, wrong purpose, expired, malformed. */
  unseal<T extends Record<string, unknown>>(
    purpose: SealPurpose,
    value: string | undefined,
  ): T | null;
  /** HMAC-free helper: a stable key for deriving one-time codes without storing them. */
  derive(label: string): Buffer;
}

export function createSealer(secret: string, now: () => number = Date.now): Sealer {
  const key = deriveKey(secret);
  return {
    seal(purpose, payload, ttlMs) {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(`${String(VERSION)}:${purpose}`));
      const body = JSON.stringify({ ...payload, exp: now() + ttlMs });
      const sealed = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
    },
    unseal<T extends Record<string, unknown>>(
      purpose: SealPurpose,
      value: string | undefined,
    ): T | null {
      if (value === undefined || value.length < 40 || value.length > 4096) return null;
      if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
      try {
        const raw = Buffer.from(value, "base64url");
        if (raw.length < IV_LENGTH + TAG_LENGTH + 2) return null;
        const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_LENGTH));
        decipher.setAAD(Buffer.from(`${String(VERSION)}:${purpose}`));
        decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
        const plain = Buffer.concat([
          decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)),
          decipher.final(),
        ]).toString("utf8");
        const parsed = JSON.parse(plain) as T & { exp?: unknown };
        if (typeof parsed.exp !== "number" || parsed.exp <= now()) return null;
        return parsed;
      } catch {
        return null;
      }
    },
    derive: (label) => Buffer.from(hkdfSync("sha256", key, "mdl-oauth-derive", label, 32)),
  };
}
