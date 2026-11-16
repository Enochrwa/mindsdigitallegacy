import { describe, expect, it } from "vitest";
import { buildCsp, isEnforcing, securityHeaders } from "./security-headers";

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

  it("is report-only by default and enforcing only when switched on", () => {
    expect(Object.keys(securityHeaders(undefined, false))).toContain(
      "Content-Security-Policy-Report-Only",
    );
    const enforced = Object.keys(securityHeaders(undefined, true));
    expect(enforced).toContain("Content-Security-Policy");
    expect(enforced).not.toContain("Content-Security-Policy-Report-Only");
    expect(isEnforcing("true")).toBe(true);
    expect(isEnforcing("yes")).toBe(false);
    expect(isEnforcing(undefined)).toBe(false);
  });

  it("sends violation reports to the API, in both report formats", () => {
    const headers = securityHeaders("https://api.example.rw", false);
    const csp = headers["Content-Security-Policy-Report-Only"] ?? "";
    expect(csp).toContain("report-uri https://api.example.rw/api/v1/csp-report");
    expect(csp).toContain("report-to csp");
    expect(headers["Reporting-Endpoints"]).toBe('csp="https://api.example.rw/api/v1/csp-report"');
  });

  it("omits reporting when no API origin is configured", () => {
    expect(buildCsp(undefined)).not.toContain("report-");
    expect(securityHeaders(undefined)["Reporting-Endpoints"]).toBeUndefined();
  });
});
