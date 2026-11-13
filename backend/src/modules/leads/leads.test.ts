import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp, errorOf, validContact } from "../../testing/fixtures.js";
import { createLeadService } from "./leads.service.js";
import type { NewLead } from "./leads.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("POST /api/v1/leads", () => {
  it("stores a valid contact lead and returns an opaque receipt", async () => {
    const { app, stored } = buildTestApp();
    const res = await request(app).post("/api/v1/leads").send(validContact);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: "received" }); // no id, no echo of personal data
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      kind: "contact",
      fullName: "Ada Uwase",
      email: "ada@example.rw",
    });
  });

  it("normalises input: trims whitespace and lowercases the email", async () => {
    const { app, stored } = buildTestApp();
    await request(app)
      .post("/api/v1/leads")
      .send({ ...validContact, fullName: "  Ada Uwase  ", email: "  ADA@Example.RW " });
    expect(stored[0]?.fullName).toBe("Ada Uwase");
    expect(stored[0]?.email).toBe("ada@example.rw");
  });

  it("records consent with the notice version and a retention date", async () => {
    const { app, stored, env } = buildTestApp();
    await request(app).post("/api/v1/leads").send(validContact);
    const lead = stored[0];
    expect(lead?.consent.privacyNoticeVersion).toBe("2026-11");
    expect(lead?.consent.acceptedAt).toBeInstanceOf(Date);
    const kept = (lead?.retainUntil.getTime() ?? 0) - (lead?.consent.acceptedAt.getTime() ?? 0);
    expect(kept).toBe(env.LEAD_RETENTION_DAYS * DAY_MS);
  });

  it("silently discards honeypot submissions with an identical response", async () => {
    const { app, stored } = buildTestApp();
    const real = await request(app).post("/api/v1/leads").send(validContact);
    const bot = await request(app)
      .post("/api/v1/leads")
      .send({ ...validContact, website: "http://spam.example" });
    expect(bot.status).toBe(real.status);
    expect(bot.body).toEqual(real.body);
    expect(stored).toHaveLength(1); // only the real one
  });

  it("does not reveal whether an email was already submitted", async () => {
    const { app } = buildTestApp();
    const first = await request(app).post("/api/v1/leads").send(validContact);
    const again = await request(app).post("/api/v1/leads").send(validContact);
    expect(again.status).toBe(first.status);
    expect(again.body).toEqual(first.body);
  });

  describe("validation", () => {
    it("rejects unknown fields instead of storing them", async () => {
      const { app, stored } = buildTestApp();
      const res = await request(app)
        .post("/api/v1/leads")
        .send({ ...validContact, isAdmin: true });
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("VALIDATION_ERROR");
      expect(stored).toHaveLength(0);
    });

    it("requires explicit consent", async () => {
      const { app, stored } = buildTestApp();
      const missing: Record<string, unknown> = { ...validContact };
      delete missing["consent"];
      for (const body of [missing, { ...validContact, consent: false }]) {
        const res = await request(app).post("/api/v1/leads").send(body);
        expect(res.status).toBe(400);
        expect(JSON.stringify(errorOf(res).details)).toContain("consent");
      }
      expect(stored).toHaveLength(0);
    });

    it("rejects an invalid email address", async () => {
      const res = await request(buildTestApp().app)
        .post("/api/v1/leads")
        .send({ ...validContact, email: "not-an-email" });
      expect(res.status).toBe(400);
      expect(JSON.stringify(errorOf(res).details)).toContain("email");
    });

    it("rejects an unknown lead kind", async () => {
      const res = await request(buildTestApp().app)
        .post("/api/v1/leads")
        .send({ ...validContact, kind: "admin_override" });
      expect(res.status).toBe(400);
    });

    it("rejects a missing body", async () => {
      const res = await request(buildTestApp().app).post("/api/v1/leads");
      expect(res.status).toBe(400);
    });

    it("does not echo submitted values in validation errors", async () => {
      const res = await request(buildTestApp().app)
        .post("/api/v1/leads")
        .send({ ...validContact, email: "private-value-123" });
      expect(JSON.stringify(res.body)).not.toContain("private-value-123");
    });
  });

  describe("injection attempts", () => {
    it("rejects NoSQL operator objects", async () => {
      const { app, stored } = buildTestApp();
      const res = await request(app)
        .post("/api/v1/leads")
        .send({ ...validContact, email: { $ne: null } });
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("INVALID_REQUEST");
      expect(stored).toHaveLength(0);
    });

    it("rejects prototype pollution via __proto__", async () => {
      const { app, stored } = buildTestApp();
      const res = await request(app)
        .post("/api/v1/leads")
        .set("Content-Type", "application/json")
        .send('{"__proto__":{"isAdmin":true},"kind":"contact"}');
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("INVALID_REQUEST");
      expect(stored).toHaveLength(0);
      expect(({} as Record<string, unknown>)["isAdmin"]).toBeUndefined();
    });

    it("rejects dotted keys and deeply nested bodies", async () => {
      const dotted = await request(buildTestApp().app)
        .post("/api/v1/leads")
        .send({ ...validContact, "a.b": 1 });
      expect(dotted.status).toBe(400);

      let deep: Record<string, unknown> = { leaf: 1 };
      for (let i = 0; i < 12; i += 1) deep = { n: deep };
      const nested = await request(buildTestApp().app)
        .post("/api/v1/leads")
        .send({ ...validContact, extra: deep });
      expect(nested.status).toBe(400);
    });
  });

  describe("kind-specific rules", () => {
    it("stores service request fields", async () => {
      const { app, stored } = buildTestApp();
      const res = await request(app).post("/api/v1/leads").send({
        kind: "service_request",
        fullName: "Jean Mugisha",
        email: "jean@example.rw",
        organization: "Kigali Clinic",
        service: "Management system",
        budget: "2,000,000 RWF",
        message: "We need appointment and records management.",
        consent: true,
        privacyNoticeVersion: "2026-11",
      });
      expect(res.status).toBe(201);
      expect(stored[0]).toMatchObject({
        kind: "service_request",
        service: "Management system",
        budget: "2,000,000 RWF",
        organization: "Kigali Clinic",
      });
    });

    const minor = {
      kind: "internship_interest",
      fullName: "Aline Ingabire",
      email: "aline@example.rw",
      interest: "Software and Web Development",
      ageBracket: "under_16",
      consent: true,
      privacyNoticeVersion: "2026-11",
    };

    it("requires a guardian contact for applicants under 16", async () => {
      const { app, stored } = buildTestApp();
      const res = await request(app).post("/api/v1/leads").send(minor);
      expect(res.status).toBe(400);
      expect(JSON.stringify(errorOf(res).details)).toContain("guardianContact");
      expect(stored).toHaveLength(0);
    });

    it("accepts an under-16 applicant with a guardian contact", async () => {
      const { app, stored } = buildTestApp();
      const res = await request(app)
        .post("/api/v1/leads")
        .send({ ...minor, guardianContact: "Mother, +250 788 000 000" });
      expect(res.status).toBe(201);
      expect(stored[0]).toMatchObject({
        ageBracket: "under_16",
        guardianContact: "Mother, +250 788 000 000",
      });
    });

    it("does not require a guardian for applicants 16 and over", async () => {
      const res = await request(buildTestApp().app)
        .post("/api/v1/leads")
        .send({ ...minor, ageBracket: "16_plus" });
      expect(res.status).toBe(201);
    });
  });
});

describe("createLeadService", () => {
  it("computes retention from an injected clock", async () => {
    const stored: NewLead[] = [];
    const now = new Date("2026-11-13T10:00:00.000Z");
    const service = createLeadService({
      repository: {
        create: (lead) => {
          stored.push(lead);
          return Promise.resolve();
        },
      },
      retentionDays: 30,
      now: () => now,
    });
    await service.submit({
      ...validContact,
      kind: "contact",
    });
    expect(stored[0]?.retainUntil.toISOString()).toBe("2026-12-13T10:00:00.000Z");
  });
});
