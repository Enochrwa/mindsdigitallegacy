import { describe, expect, it } from "vitest";
import { LeadModel } from "./leads.model.js";

/**
 * Model tests run without a database: they exercise schema validation and index definitions only.
 * Behaviour against a real MongoDB is covered by the integration task in Sprint 1 (see docs/05).
 */

const valid = {
  kind: "contact",
  fullName: "Ada Uwase",
  email: "ada@example.rw",
  message: "Hello there, I have a question.",
  consent: { privacyNoticeVersion: "2026-11", acceptedAt: new Date("2026-11-13T00:00:00Z") },
  retainUntil: new Date("2028-11-13T00:00:00Z"),
};

describe("Lead model", () => {
  it("accepts a valid lead and defaults status to new", async () => {
    const doc = new LeadModel(valid);
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.status).toBe("new");
  });

  it.each(["kind", "fullName", "email", "retainUntil"])("requires %s", async (field) => {
    const doc = new LeadModel({ ...valid, [field]: undefined });
    await expect(doc.validate()).rejects.toThrow(field);
  });

  it("requires recorded consent", async () => {
    const doc = new LeadModel({ ...valid, consent: undefined });
    await expect(doc.validate()).rejects.toThrow(/consent/);
  });

  it("rejects an unknown kind", async () => {
    await expect(new LeadModel({ ...valid, kind: "other" }).validate()).rejects.toThrow(/kind/);
  });

  it("rejects an invalid status", async () => {
    await expect(new LeadModel({ ...valid, status: "hacked" }).validate()).rejects.toThrow(
      /status/,
    );
  });

  it("enforces length limits at the storage layer too", async () => {
    const doc = new LeadModel({ ...valid, message: "x".repeat(2001) });
    await expect(doc.validate()).rejects.toThrow(/message/);
  });

  it("drops fields that are not in the schema (strict mode)", () => {
    const doc = new LeadModel({ ...valid, isAdmin: true });
    expect(doc.toObject()).not.toHaveProperty("isAdmin");
  });

  it("defines a TTL index so records are deleted at retainUntil", () => {
    const ttl = LeadModel.schema
      .indexes()
      .find(([fields]) => Object.keys(fields).join() === "retainUntil");
    expect(ttl).toBeDefined();
    expect(ttl?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });
});
