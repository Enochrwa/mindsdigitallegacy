import { describe, expect, it } from "vitest";
import {
  AGREEMENT_DRAFT,
  APPLICANT_STATUS_TEXT,
  APPLICATION_STATUSES,
  STAFF_NEXT,
  applyFailureText,
  averageRating,
  deadlineText,
  isFinal,
  linkProblem,
  parseLinks,
  statementProblem,
  workload,
} from "./internships";

const NOW = new Date("2026-12-01T10:00:00Z").getTime();
const DAY = 86_400_000;

describe("links", () => {
  it("parses one link per line, trimming and removing duplicates", () => {
    expect(parseLinks(" https://a.example \n\nhttps://b.example\nhttps://a.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
    expect(parseLinks("")).toEqual([]);
  });

  it("accepts https only, without credentials, and at most five", () => {
    expect(linkProblem(["https://github.com/ada"])).toBeNull();
    expect(linkProblem(["http://example.com"])).not.toBeNull();
    expect(linkProblem(["javascript:alert(1)"])).not.toBeNull();
    expect(linkProblem(["https://user:pw@example.com"])).not.toBeNull();
    expect(linkProblem(["nonsense"])).not.toBeNull();
    expect(
      linkProblem(Array.from({ length: 6 }, (_, i) => `https://e.example/${String(i)}`)),
    ).not.toBeNull();
  });
});

describe("statement", () => {
  it("enforces the same length limits as the server", () => {
    expect(statementProblem("short")).toMatch(/at least 50/);
    expect(statementProblem("x".repeat(50))).toBeNull();
    expect(statementProblem("x".repeat(2001))).toMatch(/under 2000/);
    expect(statementProblem("   " + "x".repeat(10) + "   ")).not.toBeNull();
  });
});

describe("status wording and actions", () => {
  it("has plain words for every status", () => {
    for (const s of APPLICATION_STATUSES) {
      expect(APPLICANT_STATUS_TEXT[s].label.length).toBeGreaterThan(2);
      expect(APPLICANT_STATUS_TEXT[s].help.length).toBeGreaterThan(10);
    }
  });

  it("never tells an applicant they have a place before the placement exists", () => {
    for (const s of ["submitted", "shortlisted", "interview", "offered", "accepted"] as const) {
      expect(APPLICANT_STATUS_TEXT[s].label.toLowerCase()).not.toContain("confirmed");
    }
    expect(APPLICANT_STATUS_TEXT.accepted.help).toMatch(/not confirmed/i);
  });

  it("offers staff no actions from a final status", () => {
    for (const s of APPLICATION_STATUSES) {
      if (isFinal(s)) expect(STAFF_NEXT[s]).toEqual([]);
    }
    expect(STAFF_NEXT.submitted).not.toContain("offered");
  });
});

describe("apply failures", () => {
  it("explains the refusals in plain words", () => {
    expect(applyFailureText("TOO_YOUNG", "rejected")).toMatch(/minimum age/);
    expect(applyFailureText("GUARDIAN_REQUIRED", "rejected")).toMatch(/guardian/);
    expect(applyFailureText(undefined, "account_not_active")).toMatch(/Verify your email/);
    expect(applyFailureText(undefined, "network")).toMatch(/connection/);
    expect(applyFailureText(undefined, "unavailable")).toMatch(/try again/i);
  });
});

describe("dates and numbers", () => {
  it("words deadlines", () => {
    expect(deadlineText(undefined, NOW)).toBe("Open until filled");
    expect(deadlineText(new Date(NOW - DAY).toISOString(), NOW)).toBe("Closed");
    expect(deadlineText(new Date(NOW + 1000).toISOString(), NOW)).toBe("Closes tomorrow");
    expect(deadlineText(new Date(NOW + 10 * DAY).toISOString(), NOW)).toBe("Closes in 10 days");
  });

  it("describes workload and averages ratings", () => {
    expect(workload({ durationWeeks: 8, hoursPerWeek: 20 })).toBe("8 weeks, about 20 hours a week");
    expect(averageRating([5, 4, undefined])).toBe(4.5);
    expect(averageRating([])).toBeNull();
  });
});

describe("agreement", () => {
  it("carries the version the server expects and says it is not a job", () => {
    expect(AGREEMENT_DRAFT.version).toBe("2026-11-draft");
    expect(AGREEMENT_DRAFT.points.join(" ")).toMatch(/not a job/);
  });
});

describe("staff helpers", () => {
  it("splits requirement lines and drops blanks", async () => {
    const { parseLines } = await import("./internships");
    expect(parseLines(" a \n\n b\r\nc ")).toEqual(["a", "b", "c"]);
  });

  it("warns about capacity the same way the server does", async () => {
    const { capacityHint } = await import("./internships");
    expect(capacityHint(0, 1, 3)).toMatch(/at least one supervisor/);
    expect(capacityHint(1, 4, 3)).toMatch(/at most 3/);
    expect(capacityHint(2, 6, 3)).toBeNull();
  });
});
