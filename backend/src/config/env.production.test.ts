import { describe, expect, it } from "vitest";
import { ConfigError, loadEnv } from "./env.js";

const PROD = {
  NODE_ENV: "production",
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/mdl",
  TOTP_ENCRYPTION_KEY: "a-production-key-that-is-at-least-32-characters-long",
  CORS_ORIGINS: "https://mindsdigitallegacy-sigma.vercel.app",
  WEB_BASE_URL: "https://mindsdigitallegacy-sigma.vercel.app",
};

describe("running mode decides the defaults", () => {
  it("listens on all interfaces in production, so a host such as Render can reach it", () => {
    expect(loadEnv(PROD).HOST).toBe("0.0.0.0");
  });

  it("listens only on this computer in development and tests", () => {
    expect(loadEnv({}).HOST).toBe("127.0.0.1");
    expect(loadEnv({ NODE_ENV: "development" }).HOST).toBe("127.0.0.1");
    expect(loadEnv({ NODE_ENV: "test" }).HOST).toBe("127.0.0.1");
  });

  it("lets an explicit HOST win in every mode, and treats an empty one as unset", () => {
    expect(loadEnv({ ...PROD, HOST: "10.0.0.5" }).HOST).toBe("10.0.0.5");
    expect(loadEnv({ HOST: "0.0.0.0" }).HOST).toBe("0.0.0.0");
    expect(loadEnv({ ...PROD, HOST: "" }).HOST).toBe("0.0.0.0");
  });

  it("uses the PORT the host provides", () => {
    expect(loadEnv({ ...PROD, PORT: "10000" }).PORT).toBe(10000);
  });
});

describe("production refuses unsafe or incomplete settings instead of starting wrongly", () => {
  const fails = (over: Record<string, string | undefined>) => () => loadEnv({ ...PROD, ...over });

  it("accepts a complete production configuration", () => {
    expect(() => loadEnv(PROD)).not.toThrow();
  });

  it("needs the database, the encryption key and https addresses", () => {
    expect(fails({ MONGODB_URI: undefined })).toThrow(ConfigError);
    expect(fails({ TOTP_ENCRYPTION_KEY: undefined })).toThrow(ConfigError);
    expect(fails({ TOTP_ENCRYPTION_KEY: "short" })).toThrow(ConfigError);
    expect(fails({ CORS_ORIGINS: "http://example.rw" })).toThrow(ConfigError);
    expect(fails({ WEB_BASE_URL: "http://example.rw" })).toThrow(ConfigError);
  });

  it("needs a state key and an https API address once a sign-in provider is switched on", () => {
    const provider = { OAUTH_GOOGLE_CLIENT_ID: "id", OAUTH_GOOGLE_CLIENT_SECRET: "secret" };
    expect(fails(provider)).toThrow(ConfigError);
    expect(fails({ ...provider, OAUTH_STATE_KEY: "x".repeat(40) })).toThrow(ConfigError); // API_PUBLIC_URL missing
    expect(() =>
      loadEnv({
        ...PROD,
        ...provider,
        OAUTH_STATE_KEY: "x".repeat(40),
        API_PUBLIC_URL: "https://mindsdigitallegacy-sigma.vercel.app",
      }),
    ).not.toThrow();
  });

  it("refuses a half-configured sign-in provider in any mode", () => {
    expect(() => loadEnv({ OAUTH_GITHUB_CLIENT_ID: "id" })).toThrow(ConfigError);
    expect(() => loadEnv({ OAUTH_GITHUB_CLIENT_SECRET: "secret" })).toThrow(ConfigError);
  });

  it("keeps development friendly: nothing production-only is required", () => {
    expect(() => loadEnv({})).not.toThrow();
    expect(() => loadEnv({ NODE_ENV: "test" })).not.toThrow();
  });
});
