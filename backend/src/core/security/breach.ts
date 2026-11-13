import { createHash } from "node:crypto";
import type { Logger } from "../logger.js";

/**
 * Breached-password check using the Have I Been Pwned range API (k-anonymity): only the first 5 characters
 * of the SHA-1 of the password leave this server, never the password or its full hash. Padding is requested
 * so response size does not reveal the match count.
 *
 * Fails OPEN: if the service is slow or down, registration must not break, so the check is skipped and a
 * warning is logged. This is a defence in depth on top of the local policy, not the only control.
 */
export interface BreachChecker {
  isBreached(password: string): Promise<boolean>;
}

export const noBreachCheck: BreachChecker = { isBreached: () => Promise.resolve(false) };

const ENDPOINT = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 2_000;

export function createHibpChecker(logger: Logger, fetchFn: typeof fetch = fetch): BreachChecker {
  return {
    async isBreached(password) {
      const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);
      try {
        const response = await fetchFn(`${ENDPOINT}${prefix}`, {
          headers: { "Add-Padding": "true", "User-Agent": "mdl-api" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
          logger.warn({ status: response.status }, "breach check skipped: unexpected status");
          return false;
        }
        const body = await response.text();
        for (const line of body.split("\n")) {
          const [candidate, count] = line.trim().split(":");
          // Padded entries have a count of 0 and must not count as a match.
          if (candidate === suffix && Number(count) > 0) return true;
        }
        return false;
      } catch {
        logger.warn("breach check skipped: service unreachable");
        return false;
      }
    },
  };
}
