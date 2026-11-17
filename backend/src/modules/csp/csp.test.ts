import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { pino } from "pino";
import { buildTestApp } from "../../testing/fixtures.js";
import { createDeduper, originOf, parseReports } from "./csp.js";
import { createCspRouter } from "./csp.routes.js";

const legacy = {
  "csp-report": {
    "document-uri": "https://mdl.example.rw/courses/web-basics?token=SECRET#frag",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.example.com/x.js?user=ada@example.rw",
    disposition: "report",
    "script-sample": "alert('personal text')",
    "original-policy": "default-src 'self'",
  },
};

describe("parseReports", () => {
  it("reduces a legacy report to directive, origin, path and disposition", () => {
    expect(parseReports(legacy)).toEqual([
      {
        directive: "script-src-elem",
        blocked: "https://evil.example.com",
        page: "/courses/web-basics",
        disposition: "report",
      },
    ]);
  });

  it("never carries query strings, fragments, samples or emails", () => {
    const text = JSON.stringify(parseReports(legacy));
    expect(text).not.toMatch(/SECRET|frag|alert|ada@|user=|\?/);
  });

  it("reads the Reporting API format", () => {
    const body = [
      {
        type: "csp-violation",
        url: "https://mdl.example.rw/",
        body: {
          documentURL: "https://mdl.example.rw/learn?x=1",
          blockedURL: "inline",
          effectiveDirective: "script-src-elem",
          disposition: "enforce",
        },
      },
      { type: "deprecation", body: {} },
    ];
    expect(parseReports(body)).toEqual([
      { directive: "script-src-elem", blocked: "inline", page: "/learn", disposition: "enforce" },
    ]);
  });

  it("ignores junk and caps the number of findings", () => {
    expect(parseReports(null)).toEqual([]);
    expect(parseReports("text")).toEqual([]);
    expect(parseReports({ "csp-report": "nope" })).toEqual([]);
    const many = Array.from({ length: 50 }, () => ({
      type: "csp-violation",
      body: {
        effectiveDirective: "img-src",
        blockedURL: "https://a.example",
        documentURL: "https://b.example/",
      },
    }));
    expect(parseReports(many)).toHaveLength(10);
  });

  it("clips long values and strips control characters", () => {
    const f = parseReports({
      "csp-report": { "effective-directive": `img-src\n${"x".repeat(500)}`, "blocked-uri": "data" },
    });
    expect(f[0]?.directive.length).toBeLessThanOrEqual(120);
    expect(f[0]?.directive).not.toMatch(/[\n\r]/);
  });
});

describe("originOf", () => {
  it("keeps keywords, reduces URLs to origins and hides everything else", () => {
    expect(originOf("inline")).toBe("inline");
    expect(originOf("https://cdn.example.com/a/b.js?q=1")).toBe("https://cdn.example.com");
    expect(originOf("not a url")).toBe("other");
    expect(originOf(undefined)).toBe("");
  });
});

describe("createDeduper", () => {
  it("lets a finding through once per window", () => {
    let t = 0;
    const seen = createDeduper(1000, 500, () => t);
    const f = { directive: "img-src", blocked: "x", page: "/", disposition: "report" as const };
    expect(seen(f)).toBe(true);
    expect(seen(f)).toBe(false);
    t = 1001;
    expect(seen(f)).toBe(true);
  });

  it("stays bounded under many distinct findings", () => {
    const seen = createDeduper(60_000, 3);
    for (let i = 0; i < 10; i += 1) {
      seen({ directive: `d${String(i)}`, blocked: "", page: "/", disposition: "report" });
    }
    // The oldest were forgotten, so the first one is reported again.
    expect(seen({ directive: "d0", blocked: "", page: "/", disposition: "report" })).toBe(true);
  });
});

describe("POST /api/v1/csp-report", () => {
  const passThrough = ((_req, _res, next) => next()) as express.RequestHandler;

  function appWithSpy() {
    const warn = vi.fn();
    const logger = Object.assign(pino({ level: "silent" }), { warn });
    const app = express();
    app.use("/csp", createCspRouter({ logger, limiter: passThrough, dedupeMs: 60_000 }));
    return { app, warn };
  }

  it("answers 204 and logs a sanitised finding for the legacy content type", async () => {
    const { app, warn } = appWithSpy();
    const res = await request(app)
      .post("/csp")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify(legacy));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toMatch(/SECRET|ada@|alert/);
  });

  it("logs a repeated identical report only once", async () => {
    const { app, warn } = appWithSpy();
    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post("/csp")
        .set("Content-Type", "application/csp-report")
        .send(JSON.stringify(legacy));
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("answers 204 to malformed and oversized bodies without logging", async () => {
    const { app, warn } = appWithSpy();
    const bad = await request(app)
      .post("/csp")
      .set("Content-Type", "application/json")
      .send("{not json");
    const big = await request(app)
      .post("/csp")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ pad: "x".repeat(40_000) }));
    expect([bad.status, big.status]).toEqual([204, 204]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("is reachable through the real app stack despite the JSON-only guard", async () => {
    const { app } = buildTestApp({});
    const res = await request(app)
      .post("/api/v1/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify(legacy));
    expect(res.status).toBe(204);
  });

  it("is rate limited per client in the real app", async () => {
    const { app } = buildTestApp({ env: { RATE_LIMIT_CSP_REPORTS_PER_MINUTE: "2" } });
    const send = () =>
      request(app)
        .post("/api/v1/csp-report")
        .set("Content-Type", "application/csp-report")
        .send(JSON.stringify(legacy));
    const statuses = [(await send()).status, (await send()).status, (await send()).status];
    expect(statuses).toEqual([204, 204, 429]);
  });
});
