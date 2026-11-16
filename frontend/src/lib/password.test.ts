import { describe, expect, it } from "vitest";
import { WORDS, generatePassphrase, scorePassword } from "./password";

describe("scorePassword", () => {
  it("says nothing for an empty field", () => {
    expect(scorePassword("")).toEqual({ level: 0, label: "", tips: [] });
  });

  it("marks short and common passwords weak and explains why", () => {
    const short = scorePassword("abc123");
    expect(short.level).toBe(1);
    expect(short.tips.join(" ")).toMatch(/at least 10/);
    expect(scorePassword("password1234").level).toBe(1);
  });

  it("penalises personal details", () => {
    const plain = scorePassword("grapefruit-lamp-9", []);
    const personal = scorePassword("grapefruit-lamp-9", ["Grapefruit"]);
    expect(personal.level).toBeLessThan(plain.level);
    expect(personal.tips.join(" ")).toMatch(/name and your email/);
  });

  it("rewards long passphrases", () => {
    expect(scorePassword("river-lantern-mango-drum-heron-42").level).toBeGreaterThanOrEqual(3);
  });
});

describe("generatePassphrase", () => {
  it("uses unique, lowercase, well-formed words", () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(WORDS).toHaveLength(128);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]+$/);
  });

  it("produces five words and a number, and a different result each time", () => {
    const a = generatePassphrase();
    const b = generatePassphrase();
    expect(a).toMatch(/^([a-z]+-){5}\d\d$/);
    expect(a).not.toBe(b);
  });

  it("is deterministic for a given byte source and always scores well", () => {
    const fixed = () => Uint8Array.from({ length: 64 }, (_, i) => (i * 37) % 256);
    expect(generatePassphrase(fixed)).toBe(generatePassphrase(fixed));
    expect(scorePassword(generatePassphrase()).level).toBeGreaterThanOrEqual(3);
  });
});
