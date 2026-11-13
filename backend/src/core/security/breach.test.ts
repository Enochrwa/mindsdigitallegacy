import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../logger.js";
import { createHibpChecker } from "./breach.js";

const logger = createLogger({ LOG_LEVEL: "silent", LOG_PRETTY: false });
const sha1 = (v: string) => createHash("sha1").update(v).digest("hex").toUpperCase();

describe("HIBP range checker", () => {
  it("sends only a 5-character hash prefix and detects a match", async () => {
    const password = "hunter2hunter2";
    const hash = sha1(password);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(`${hash.slice(5)}:42\r\n0000000000000000000000000000000000A:3`),
      );
    const checker = createHibpChecker(logger, fetchFn);
    expect(await checker.isBreached(password)).toBe(true);
    const url = String(fetchFn.mock.calls[0]?.[0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain(hash.slice(5));
    expect(url).not.toContain(password);
  });

  it("ignores padding entries (count 0) and non-matches", async () => {
    const hash = sha1("a-unique-passphrase-1");
    const fetchFn = vi.fn().mockResolvedValue(new Response(`${hash.slice(5)}:0\r\nFFFF:12`));
    const checker = createHibpChecker(logger, fetchFn);
    expect(await checker.isBreached("a-unique-passphrase-1")).toBe(false);
  });

  it("fails open on errors, bad status and timeouts", async () => {
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    const bad = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    expect(
      await createHibpChecker(logger, down as unknown as typeof fetch).isBreached("x".repeat(12)),
    ).toBe(false);
    expect(
      await createHibpChecker(logger, bad as unknown as typeof fetch).isBreached("x".repeat(12)),
    ).toBe(false);
  });
});
