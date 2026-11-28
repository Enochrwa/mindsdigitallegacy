import { describe, expect, it } from "vitest";
import { checkEnv } from "../../scripts/check-env.mjs";

const run = (env: Record<string, string>) => checkEnv(env);

describe("build-time environment check", () => {
  it("lets ordinary development and CI builds through, with no setup", () => {
    expect(run({}).errors).toEqual([]);
    expect(
      run({ NODE_ENV: "development", VITE_API_BASE_URL: "http://localhost:4000" }).errors,
    ).toEqual([]);
    expect(run({ CI: "true" }).summary).toContain("development/ci");
  });

  it("accepts the intended Vercel production setup: the API address in API_PROXY_TARGET, nothing else", () => {
    const r = run({
      VERCEL: "1",
      VERCEL_ENV: "production",
      API_PROXY_TARGET: "https://mindsdigitallegacyserver.onrender.com",
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.summary).toBe(
      "mode: vercel production; API: proxied to https://mindsdigitallegacyserver.onrender.com",
    );
  });

  it("stops a Vercel build that would produce a site whose API calls all 404", () => {
    const r = run({ VERCEL: "1", VERCEL_ENV: "production" });
    expect(r.errors.join(" ")).toMatch(/API_PROXY_TARGET/);
    expect(run({ VERCEL: "1", VERCEL_ENV: "preview" }).errors).not.toEqual([]);
  });

  it("stops a production build that points at this computer", () => {
    expect(
      run({
        VERCEL: "1",
        VERCEL_ENV: "production",
        VITE_API_BASE_URL: "http://localhost:4000",
      }).errors.join(" "),
    ).toMatch(/this computer/);
    expect(
      run({ NODE_ENV: "production", VITE_API_BASE_URL: "http://127.0.0.1:4000" }).errors.join(" "),
    ).toMatch(/this computer/);
    expect(
      run({
        VERCEL: "1",
        VERCEL_ENV: "production",
        API_PROXY_TARGET: "https://localhost:4000",
      }).errors.join(" "),
    ).toMatch(/this computer/);
  });

  it("rejects a badly written proxy address", () => {
    for (const bad of [
      "http://api.example.com",
      "https://api.example.com/",
      "https://api.example.com/api",
      "api.example.com",
      "https://a b.com",
    ]) {
      expect(
        run({ VERCEL: "1", VERCEL_ENV: "production", API_PROXY_TARGET: bad }).errors,
        bad,
      ).not.toEqual([]);
    }
  });

  it("refuses two ways of reaching the API at once", () => {
    const r = run({
      VERCEL: "1",
      VERCEL_ENV: "production",
      API_PROXY_TARGET: "https://api.example.com",
      VITE_API_BASE_URL: "https://api.example.com",
    });
    expect(r.errors.join(" ")).toMatch(/not both/);
  });

  it("warns, but allows, a direct cross-site API address in production", () => {
    const r = run({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VITE_API_BASE_URL: "https://api.example.com",
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/cookie/);
  });
});
