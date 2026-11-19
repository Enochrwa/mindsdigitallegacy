import { describe, expect, it } from "vitest";
import {
  PROVIDER_IDS,
  PROVIDER_LABEL,
  completeFailureWording,
  failureWording,
  isProviderId,
  safeNext,
  startUrl,
} from "./oauth";

describe("providers", () => {
  it("labels every provider and recognises only known ids", () => {
    for (const id of PROVIDER_IDS) expect(PROVIDER_LABEL[id].length).toBeGreaterThan(2);
    expect(isProviderId("google")).toBe(true);
    expect(isProviderId("twitter")).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });
});

describe("start address", () => {
  it("points at the API start route for the provider", () => {
    expect(startUrl("github")).toMatch(/\/api\/v1\/auth\/oauth\/github\/start$/);
  });

  it("carries only a same-site next page", () => {
    expect(startUrl("google", "/learning")).toMatch(/start\?next=%2Flearning$/);
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "x".repeat(300),
    ]) {
      expect(startUrl("google", bad), bad).not.toContain("next=");
    }
    expect(safeNext("/a/b?c=1")).toBe("/a/b?c=1");
    expect(safeNext(undefined)).toBeUndefined();
  });
});

describe("failure wording", () => {
  it("words every code the API can send, and never echoes unknown text", () => {
    for (const code of [
      "denied",
      "failed",
      "expired",
      "unavailable",
      "email_missing",
      "account_exists",
      "identity_in_use",
      "inactive",
      "paused",
    ]) {
      expect(failureWording(`oauth_${code}`), code).toMatch(/\w/);
      expect(failureWording(code), code).toMatch(/\w/);
    }
    expect(failureWording(undefined)).toBeNull();
    expect(failureWording("oauth_<script>alert(1)</script>")).not.toContain("script");
    expect(failureWording("something_else")).toBeNull();
  });

  it("tells people with an existing account how to connect a provider", () => {
    expect(failureWording("oauth_account_exists")).toMatch(/connect the provider/);
  });

  it("words the sign-up completion failures", () => {
    expect(completeFailureWording("INVALID_CODE", "rejected")).toMatch(/not right/);
    expect(completeFailureWording("SIGNUP_EXPIRED", "rejected")).toMatch(/start again/);
    expect(completeFailureWording(undefined, "rate_limited")).toMatch(/Too many/);
    expect(completeFailureWording(undefined, "unavailable")).toMatch(/try again/i);
  });
});
