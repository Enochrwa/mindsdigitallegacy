import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with argon2id from Node's built-in crypto (no native dependency to compile or audit).
 * Defaults follow the OWASP minimum recommendation (19 MiB, 2 passes, 1 lane). Tune `memoryKiB` and
 * `passes` to about 100 ms on the production host (LLD section 4) and record the result.
 *
 * Stored format (PHC string): $argon2id$v=19$m=<KiB>,t=<passes>,p=<lanes>$<salt b64>$<hash b64>
 */

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** Constant-time comparison. Returns false for malformed stored hashes instead of throwing. */
  verify(password: string, stored: string): Promise<boolean>;
}

export interface Argon2Options {
  memoryKiB: number;
  passes: number;
  parallelism: number;
}

export const DEFAULT_ARGON2: Argon2Options = { memoryKiB: 19_456, passes: 2, parallelism: 1 };
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, options: Argon2Options): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: Buffer.from(password, "utf8"),
        nonce: salt,
        parallelism: options.parallelism,
        tagLength: TAG_LENGTH,
        memory: options.memoryKiB,
        passes: options.passes,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export function createPasswordHasher(options: Argon2Options = DEFAULT_ARGON2): PasswordHasher {
  return {
    async hash(password) {
      const salt = randomBytes(SALT_LENGTH);
      const key = await derive(password, salt, options);
      return `$argon2id$v=19$m=${options.memoryKiB},t=${options.passes},p=${options.parallelism}$${salt.toString("base64").replace(/=+$/, "")}$${key.toString("base64").replace(/=+$/, "")}`;
    },
    async verify(password, stored) {
      const match = PHC.exec(stored);
      if (match === null) return false;
      const [, m, t, p, saltB64, hashB64] = match;
      if (m === undefined || t === undefined || p === undefined) return false;
      if (saltB64 === undefined || hashB64 === undefined) return false;
      const expected = Buffer.from(hashB64, "base64");
      // Parameters come from our own database, but cap them so a corrupted row cannot exhaust memory.
      const params = { memoryKiB: Number(m), passes: Number(t), parallelism: Number(p) };
      if (params.memoryKiB > 1_048_576 || params.passes > 10 || params.parallelism > 8)
        return false;
      const actual = await derive(password, Buffer.from(saltB64, "base64"), params);
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },
  };
}
