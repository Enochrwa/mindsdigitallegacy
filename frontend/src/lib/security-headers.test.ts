import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("allows only the no-cookie YouTube frame and thumbnail host (ADR-0005)", () => {
    const csp = buildCsp("https://api.example.rw");
    expect(csp).toContain("frame-src https://www.youtube-nocookie.com");
    expect(csp).toContain("img-src 'self' https://i.ytimg.com data:");
    expect(csp).toContain("connect-src 'self' https://api.example.rw");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/youtube\.com(?!-)/);
  });

  it("never sets Referrer-Policy to no-referrer on pages (breaks embeds)", () => {
    expect(securityHeaders(undefined)["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("is report-only for now", () => {
    expect(Object.keys(securityHeaders(undefined))).toContain(
      "Content-Security-Policy-Report-Only",
    );
  });
});
