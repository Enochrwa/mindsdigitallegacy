import request from "supertest";
import { describe, expect, it } from "vitest";
import { ALLOWED_ORIGIN, buildTestApp, errorOf, validContact } from "./testing/fixtures.js";

describe("security headers", () => {
  it("sends a locked-down header set and hides the framework", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/api/v1/health");

    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets HSTS only in production", async () => {
    const dev = await request(buildTestApp().app).get("/api/v1/health");
    expect(dev.headers["strict-transport-security"]).toBeUndefined();

    const prod = buildTestApp({
      env: {
        NODE_ENV: "production",
        MONGODB_URI: "mongodb://db.internal:27017/mdl",
        CORS_ORIGINS: ALLOWED_ORIGIN,
      },
    });
    const res = await request(prod.app).get("/api/v1/health");
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
  });
});

describe("health endpoints", () => {
  it("reports liveness without leaking details", async () => {
    const res = await request(buildTestApp().app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("reports readiness based on the database", async () => {
    const up = await request(buildTestApp({ dbReady: true }).app).get("/api/v1/ready");
    expect(up.status).toBe(200);
    expect(up.body).toEqual({ status: "ready" });

    const down = await request(buildTestApp({ dbReady: false }).app).get("/api/v1/ready");
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ status: "unavailable" });
  });
});

describe("request ids", () => {
  it("generates an id when none is supplied", async () => {
    const res = await request(buildTestApp().app).get("/api/v1/health");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("echoes a well-formed inbound id", async () => {
    const res = await request(buildTestApp().app)
      .get("/api/v1/health")
      .set("X-Request-Id", "abc-12345678");
    expect(res.headers["x-request-id"]).toBe("abc-12345678");
  });

  it("replaces a malformed inbound id", async () => {
    const res = await request(buildTestApp().app)
      .get("/api/v1/health")
      .set("X-Request-Id", "not valid!!");
    expect(res.headers["x-request-id"]).not.toBe("not valid!!");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("CORS", () => {
  it("allows a listed origin with credentials", async () => {
    const res = await request(buildTestApp().app)
      .get("/api/v1/health")
      .set("Origin", ALLOWED_ORIGIN);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("gives no CORS headers to an unlisted origin", async () => {
    const res = await request(buildTestApp().app)
      .get("/api/v1/health")
      .set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers a preflight for a listed origin", async () => {
    const res = await request(buildTestApp().app)
      .options("/api/v1/leads")
      .set("Origin", ALLOWED_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("never reflects a wildcard", async () => {
    const res = await request(buildTestApp().app)
      .get("/api/v1/health")
      .set("Origin", ALLOWED_ORIGIN);
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
  });
});

describe("origin guard (CSRF defence in depth)", () => {
  it("rejects a state-changing request from an unlisted origin", async () => {
    const { app, stored } = buildTestApp();
    const res = await request(app)
      .post("/api/v1/leads")
      .set("Origin", "https://evil.example")
      .send(validContact);
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("FORBIDDEN_ORIGIN");
    expect(stored).toHaveLength(0);
  });

  it('rejects the opaque origin "null"', async () => {
    const res = await request(buildTestApp().app)
      .post("/api/v1/leads")
      .set("Origin", "null")
      .send(validContact);
    expect(res.status).toBe(403);
  });

  it("accepts a listed origin and requests without an Origin header", async () => {
    const withOrigin = await request(buildTestApp().app)
      .post("/api/v1/leads")
      .set("Origin", ALLOWED_ORIGIN)
      .send(validContact);
    expect(withOrigin.status).toBe(201);

    const withoutOrigin = await request(buildTestApp().app)
      .post("/api/v1/leads")
      .send(validContact);
    expect(withoutOrigin.status).toBe(201);
  });
});

describe("request body handling", () => {
  it.each([
    ["text/plain", "hello"],
    ["application/x-www-form-urlencoded", "kind=contact&fullName=Ada"],
  ])("rejects %s with 415", async (contentType, body) => {
    const res = await request(buildTestApp().app)
      .post("/api/v1/leads")
      .set("Content-Type", contentType)
      .send(body);
    expect(res.status).toBe(415);
    expect(errorOf(res).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects an oversized body with 413", async () => {
    const res = await request(buildTestApp().app)
      .post("/api/v1/leads")
      .send({ ...validContact, message: "x".repeat(20_000) });
    expect(res.status).toBe(413);
    expect(errorOf(res).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects malformed JSON with 400 and does not echo the input", async () => {
    const res = await request(buildTestApp().app)
      .post("/api/v1/leads")
      .set("Content-Type", "application/json")
      .send('{"fullName": "secret-fragment",');
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("INVALID_JSON");
    expect(JSON.stringify(res.body)).not.toContain("secret-fragment");
  });

  it("rejects a top-level JSON array or string (strict mode)", async () => {
    const res = await request(buildTestApp().app)
      .post("/api/v1/leads")
      .set("Content-Type", "application/json")
      .send('"just a string"');
    expect(res.status).toBe(400);
  });
});

describe("error responses", () => {
  it("returns a JSON 404 with a request id for unknown routes", async () => {
    const res = await request(buildTestApp().app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe("NOT_FOUND");
    expect(errorOf(res).requestId).toBe(res.headers["x-request-id"]);
  });

  it("hides internal error details on a 500", async () => {
    const { app } = buildTestApp({
      repository: { create: () => Promise.reject(new Error("db exploded at host 10.0.0.5")) },
    });
    const res = await request(app).post("/api/v1/leads").send(validContact);
    expect(res.status).toBe(500);
    expect(errorOf(res).code).toBe("INTERNAL_ERROR");
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("db exploded");
    expect(raw).not.toContain("10.0.0.5");
    expect(raw).not.toContain("stack");
  });
});

describe("rate limiting", () => {
  it("throttles the global limit and exposes standard headers", async () => {
    const { app } = buildTestApp({ env: { RATE_LIMIT_GENERAL_PER_MINUTE: "3" } });
    const statuses: number[] = [];
    let last = await request(app).get("/api/v1/nothing");
    statuses.push(last.status);
    for (let i = 0; i < 3; i += 1) {
      last = await request(app).get("/api/v1/nothing");
      statuses.push(last.status);
    }
    expect(statuses).toEqual([404, 404, 404, 429]);
    expect(errorOf(last).code).toBe("RATE_LIMITED");
    expect(last.headers["ratelimit"] ?? last.headers["retry-after"]).toBeDefined();
  });

  it("never throttles health probes", async () => {
    const { app } = buildTestApp({ env: { RATE_LIMIT_GENERAL_PER_MINUTE: "1" } });
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get("/api/v1/health");
      expect(res.status).toBe(200);
    }
  });

  it("applies a stricter limit to lead submission", async () => {
    const { app, stored } = buildTestApp({ env: { RATE_LIMIT_LEADS_PER_HOUR: "2" } });
    const first = await request(app).post("/api/v1/leads").send(validContact);
    const second = await request(app).post("/api/v1/leads").send(validContact);
    const third = await request(app).post("/api/v1/leads").send(validContact);
    expect([first.status, second.status, third.status]).toEqual([201, 201, 429]);
    expect(stored).toHaveLength(2);
  });
});
