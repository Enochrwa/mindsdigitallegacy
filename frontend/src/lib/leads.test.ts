import { describe, expect, it } from "vitest";
import { toLeadPayload } from "./leads";

const base = { fullName: " Ada Uwase ", email: "ada@example.rw", phone: "+250 788 000 000" };

describe("toLeadPayload", () => {
  it("always carries consent, the notice version and trimmed values", () => {
    const p = toLeadPayload("contact", {
      values: { ...base, subject: "Services", message: "Hello there, a question." },
    });
    expect(p).toMatchObject({
      kind: "contact",
      fullName: "Ada Uwase",
      consent: true,
      privacyNoticeVersion: "2026-11",
    });
    expect(p["message"]).toBe("Subject: Services\nHello there, a question.");
  });

  it("omits empty optional fields (the API rejects empty strings for some)", () => {
    const p = toLeadPayload("services", {
      values: {
        ...base,
        organization: "",
        service: "Web",
        budget: " ",
        details: "Build us a website please.",
      },
    });
    expect(p).not.toHaveProperty("organization");
    expect(p).not.toHaveProperty("budget");
    expect(p).not.toHaveProperty("website");
  });

  it("sends only keys the strict API schema knows", () => {
    const known: Record<string, string[]> = {
      contact: [
        "kind",
        "fullName",
        "email",
        "phone",
        "message",
        "consent",
        "privacyNoticeVersion",
        "website",
      ],
      service_request: [
        "kind",
        "fullName",
        "email",
        "phone",
        "organization",
        "service",
        "budget",
        "message",
        "consent",
        "privacyNoticeVersion",
        "website",
      ],
      partner_inquiry: [
        "kind",
        "fullName",
        "email",
        "phone",
        "organization",
        "partnerType",
        "message",
        "consent",
        "privacyNoticeVersion",
        "website",
      ],
      course_interest: [
        "kind",
        "fullName",
        "email",
        "phone",
        "ageBracket",
        "guardianContact",
        "interest",
        "message",
        "consent",
        "privacyNoticeVersion",
        "website",
      ],
      internship_interest: [
        "kind",
        "fullName",
        "email",
        "phone",
        "ageBracket",
        "guardianContact",
        "interest",
        "message",
        "consent",
        "privacyNoticeVersion",
        "website",
      ],
    };
    const everything = {
      ...base,
      subject: "s",
      message: "m",
      area: "a",
      portfolio: "p",
      about: "a",
      organization: "o",
      service: "s",
      budget: "b",
      details: "details here",
      sector: "x",
      topic: "t",
      participants: "5",
      course: "c",
      mode: "m",
      level: "l",
      notes: "n",
      type: "Academic",
      institution: "i",
      program: "p",
      department: "d",
      duration: "1 month",
      motivation: "mm",
    };
    for (const form of [
      "contact",
      "careers",
      "services",
      "corporate",
      "academy",
      "internships",
    ] as const) {
      const p = toLeadPayload(form, {
        values: everything,
        ageBracket: "under_16",
        guardianContact: "parent@example.rw",
        website: "x",
      });
      const allowed = known[p["kind"] as string] ?? [];
      for (const key of Object.keys(p)) expect(allowed, `${form}: ${key}`).toContain(key);
    }
  });

  it("maps age and guardian for course and internship interest, and the honeypot when filled", () => {
    const p = toLeadPayload("academy", {
      values: { ...base, course: "Excel", mode: "Online" },
      ageBracket: "under_16",
      guardianContact: "parent@example.rw",
      website: "spam",
    });
    expect(p).toMatchObject({
      kind: "course_interest",
      ageBracket: "under_16",
      guardianContact: "parent@example.rw",
      website: "spam",
    });
  });

  it("composes internship interest and message from the form fields", () => {
    const p = toLeadPayload("internships", {
      values: {
        ...base,
        department: "Software",
        type: "Academic",
        institution: "UR",
        program: "CS",
        motivation: "Learn.",
      },
      ageBracket: "16_plus",
    });
    expect(p["interest"]).toBe("Software (Academic)");
    expect(p["message"]).toBe("Institution: UR\nField of study: CS\nLearn.");
  });
});
