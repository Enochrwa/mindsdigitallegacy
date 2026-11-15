import { describe, expect, it } from "vitest";
import {
  inviteUrl,
  looksLikeCode,
  normaliseCode,
  progressPercent,
  recalledCode,
  rememberCode,
  shareLinks,
} from "./referrals";

describe("referral helpers", () => {
  it("accepts only well-formed codes, case-insensitively", () => {
    expect(looksLikeCode(" k7m2xq9p ")).toBe(true);
    expect(normaliseCode(" k7m2xq9p ")).toBe("K7M2XQ9P");
    for (const bad of ["", "SHORT", "K7M2XQ9PX", "K7M2XQ90", "K7M2XQ1O", "K7M2 XQ9"])
      expect(looksLikeCode(bad)).toBe(false);
  });

  it("builds an invite link and encodes share targets", () => {
    const url = inviteUrl("https://app.example.rw", "K7M2XQ9P");
    expect(url).toBe("https://app.example.rw/r/K7M2XQ9P");
    const links = shareLinks(url);
    expect(links.map((l) => l.id)).toEqual([
      "whatsapp",
      "x",
      "linkedin",
      "facebook",
      "telegram",
      "email",
    ]);
    expect(links[0]?.href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(links.every((l) => !l.href.includes(" "))).toBe(true);
  });

  it("computes a bounded progress percentage", () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(5, 3)).toBe(100);
    expect(progressPercent(0, 0)).toBe(100);
    expect(progressPercent(-2, 3)).toBe(0);
  });

  it("does not throw when storage is unavailable", () => {
    expect(() => rememberCode("K7M2XQ9P")).not.toThrow();
    expect(typeof recalledCode()).toBe("string");
  });
});
