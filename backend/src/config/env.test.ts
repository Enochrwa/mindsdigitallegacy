import { describe, expect, it } from "vitest";
import { ConfigError, loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies safe defaults", () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.HOST).toBe("127.0.0.1"); // loopback by default; containers opt in to 0.0.0.0
    expect(env.PORT).toBe(4000);
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.LOG_PRETTY).toBe(false); // JSON logs unless explicitly asked otherwise
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it("parses a comma-separated CORS allow-list", () => {
    const env = loadEnv({ CORS_ORIGINS: "https://a.example.rw, http://localhost:5173" });
    expect(env.CORS_ORIGINS).toEqual(["https://a.example.rw", "http://localhost:5173"]);
  });

  it.each([
    "*",
    "https://a.example.rw/",
    "https://a.example.rw/app",
    "javascript:alert(1)",
    "a.rw",
  ])("rejects the CORS origin %s", (origin) => {
    expect(() => loadEnv({ CORS_ORIGINS: origin })).toThrow(ConfigError);
  });

  it("treats empty strings as unset", () => {
    const env = loadEnv({ PORT: "", MONGODB_URI: "" });
    expect(env.PORT).toBe(4000);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ PORT: "70000" })).toThrow(ConfigError);
    expect(() => loadEnv({ PORT: "abc" })).toThrow(ConfigError);
  });

  describe("production", () => {
    const valid = {
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://db.internal:27017/mdl",
      CORS_ORIGINS: "https://app.example.rw",
    };

    it("accepts a complete configuration", () => {
      expect(loadEnv(valid).NODE_ENV).toBe("production");
    });

    it("requires a database URI", () => {
      expect(() => loadEnv({ ...valid, MONGODB_URI: "" })).toThrow(/MONGODB_URI/);
    });

    it("requires at least one CORS origin", () => {
      expect(() => loadEnv({ ...valid, CORS_ORIGINS: "" })).toThrow(/CORS_ORIGINS/);
    });

    it("requires https origins", () => {
      expect(() => loadEnv({ ...valid, CORS_ORIGINS: "http://app.example.rw" })).toThrow(/https/);
    });
  });

  it("never prints configuration values in error messages", () => {
    try {
      loadEnv({ MONGODB_URI: "notmongo://user:super-secret-password@host" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).toContain("MONGODB_URI");
      expect((err as ConfigError).message).not.toContain("super-secret-password");
    }
  });
});
