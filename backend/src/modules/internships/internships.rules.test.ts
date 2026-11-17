import { describe, expect, it } from "vitest";
import {
  canMove,
  canWithdraw,
  checkEligibility,
  checkPlacement,
  cleanLink,
  isOpenForApplications,
  isTerminal,
  maxSlots,
  RESERVED_SLUGS,
  slugify,
  STAFF_TARGETS,
} from "./internships.rules.js";
import { APPLICATION_STATUSES } from "./internships.types.js";
import type { ApplicationStatus, Posting } from "./internships.types.js";

const NOW = new Date("2026-12-01T10:00:00Z");
const DAY = 86_400_000;

const posting = (over: Partial<Posting> = {}): Posting => ({
  id: "p1",
  slug: "web-intern",
  title: "Web intern",
  department: "software_web",
  summary: "s",
  description: "d",
  requirements: [],
  learningGoals: [],
  mode: "hybrid",
  location: "Kigali",
  durationWeeks: 8,
  hoursPerWeek: 20,
  compensation: "unpaid",
  compensationNote: "",
  minAge: 16,
  slots: 2,
  supervisorIds: ["s1"],
  status: "published",
  createdBy: "a",
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const adult = {
  ageBracket: "16_plus" as const,
  emailVerifiedAt: NOW,
  deletedAt: undefined,
  suspendedAt: undefined,
  guardian: undefined,
};

describe("application state machine", () => {
  it("allows exactly the documented moves and nothing else", () => {
    const allowed: [ApplicationStatus, ApplicationStatus, "staff" | "applicant" | "system"][] = [
      ["submitted", "shortlisted", "staff"],
      ["submitted", "rejected", "staff"],
      ["submitted", "withdrawn", "applicant"],
      ["shortlisted", "interview", "staff"],
      ["shortlisted", "offered", "staff"],
      ["shortlisted", "rejected", "staff"],
      ["shortlisted", "withdrawn", "applicant"],
      ["interview", "offered", "staff"],
      ["interview", "rejected", "staff"],
      ["interview", "withdrawn", "applicant"],
      ["offered", "accepted", "applicant"],
      ["offered", "rejected", "staff"],
      ["offered", "withdrawn", "applicant"],
      ["accepted", "placed", "system"],
      ["accepted", "rejected", "staff"],
      ["accepted", "withdrawn", "applicant"],
    ];
    let count = 0;
    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        for (const by of ["staff", "applicant", "system"] as const) {
          const expected = allowed.some(([f, t, b]) => f === from && t === to && b === by);
          expect(canMove(from, to, by), `${from}->${to} by ${by}`).toBe(expected);
          if (expected) count += 1;
        }
      }
    }
    expect(count).toBe(allowed.length);
  });

  it("never lets anyone leave a final state", () => {
    for (const from of ["rejected", "withdrawn", "placed"] as const) {
      for (const to of APPLICATION_STATUSES) {
        for (const by of ["staff", "applicant", "system"] as const) {
          expect(canMove(from, to, by)).toBe(false);
        }
      }
      expect(isTerminal(from)).toBe(true);
    }
  });

  it("keeps the decisive steps with the right person", () => {
    // Only the applicant can accept; only the system places; staff cannot place or accept directly.
    expect(canMove("offered", "accepted", "staff")).toBe(false);
    expect(canMove("accepted", "placed", "staff")).toBe(false);
    expect(canMove("accepted", "placed", "applicant")).toBe(false);
    // Staff can never skip straight from submitted to offered.
    expect(canMove("submitted", "offered", "staff")).toBe(false);
    expect(STAFF_TARGETS).not.toContain("placed");
    expect(STAFF_TARGETS).not.toContain("accepted");
  });

  it("lets an applicant withdraw only before placement", () => {
    expect(canWithdraw("submitted")).toBe(true);
    expect(canWithdraw("offered")).toBe(true);
    expect(canWithdraw("placed")).toBe(false);
    expect(canWithdraw("rejected")).toBe(false);
  });
});

describe("posting window", () => {
  it("is open only when published and inside its dates", () => {
    expect(isOpenForApplications(posting(), NOW)).toBe(true);
    expect(isOpenForApplications(posting({ status: "draft" }), NOW)).toBe(false);
    expect(isOpenForApplications(posting({ status: "closed" }), NOW)).toBe(false);
    expect(isOpenForApplications(posting({ opensAt: new Date(NOW.getTime() + DAY) }), NOW)).toBe(
      false,
    );
    expect(isOpenForApplications(posting({ closesAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(
      false,
    );
    expect(isOpenForApplications(posting({ closesAt: NOW }), NOW)).toBe(false);
    expect(isOpenForApplications(posting({ closesAt: new Date(NOW.getTime() + 1) }), NOW)).toBe(
      true,
    );
  });

  it("limits slots to supervisors times the per-supervisor cap", () => {
    expect(maxSlots(2, 3)).toBe(6);
    expect(maxSlots(0, 3)).toBe(0);
  });
});

describe("eligibility", () => {
  const ok = { under18: false, hasGuardian: false };

  it("accepts a verified adult on an open posting", () => {
    expect(checkEligibility(adult, posting(), ok, NOW)).toBeNull();
  });

  it("refuses accounts that are not in good standing", () => {
    expect(checkEligibility({ ...adult, emailVerifiedAt: undefined }, posting(), ok, NOW)).toBe(
      "NOT_ACTIVE",
    );
    expect(checkEligibility({ ...adult, suspendedAt: NOW }, posting(), ok, NOW)).toBe("NOT_ACTIVE");
    expect(checkEligibility({ ...adult, deletedAt: NOW }, posting(), ok, NOW)).toBe("NOT_ACTIVE");
  });

  it("never lets an under-16 learner apply", () => {
    expect(checkEligibility({ ...adult, ageBracket: "under_16" }, posting(), ok, NOW)).toBe(
      "TOO_YOUNG",
    );
  });

  it("refuses closed postings", () => {
    expect(checkEligibility(adult, posting({ status: "closed" }), ok, NOW)).toBe("POSTING_CLOSED");
  });

  it("requires a guardian for under-18s and rejects one for adults", () => {
    expect(checkEligibility(adult, posting(), { under18: true, hasGuardian: false }, NOW)).toBe(
      "GUARDIAN_REQUIRED",
    );
    expect(
      checkEligibility(adult, posting(), { under18: true, hasGuardian: true }, NOW),
    ).toBeNull();
    expect(checkEligibility(adult, posting(), { under18: false, hasGuardian: true }, NOW)).toBe(
      "GUARDIAN_NOT_ALLOWED",
    );
  });

  it("keeps under-18s out of postings that need adults", () => {
    expect(
      checkEligibility(adult, posting({ minAge: 18 }), { under18: true, hasGuardian: true }, NOW),
    ).toBe("TOO_YOUNG");
  });
});

describe("placement checks", () => {
  const base = {
    application: {
      status: "accepted" as const,
      agreementAcceptedAt: NOW,
      under18: false,
      guardian: undefined,
    },
    posting: { slots: 2, supervisorIds: ["s1"] },
    supervisorId: "s1",
    supervisorActive: 0,
    activeOnPosting: 0,
    perSupervisor: 3,
    startsOn: NOW,
    endsOn: new Date(NOW.getTime() + 56 * DAY),
  };

  it("allows a complete, in-capacity placement", () => {
    expect(checkPlacement(base)).toBeNull();
  });

  it("requires acceptance and the agreement", () => {
    expect(
      checkPlacement({ ...base, application: { ...base.application, status: "offered" } }),
    ).toBe("NOT_ACCEPTED");
    expect(
      checkPlacement({
        ...base,
        application: { ...base.application, agreementAcceptedAt: undefined },
      }),
    ).toBe("NO_AGREEMENT");
  });

  it("requires a verified guardian for under-18s", () => {
    const minor = {
      ...base.application,
      under18: true,
      guardian: { name: "G", relationship: "mother", contact: "x" },
    };
    expect(checkPlacement({ ...base, application: minor })).toBe("GUARDIAN_NOT_VERIFIED");
    const verified = { ...minor, guardian: { ...minor.guardian, verifiedAt: NOW } };
    expect(checkPlacement({ ...base, application: verified })).toBeNull();
  });

  it("enforces no supervisor, no intern, and capacity limits", () => {
    expect(checkPlacement({ ...base, supervisorId: "other" })).toBe("SUPERVISOR_NOT_ON_POSTING");
    expect(checkPlacement({ ...base, supervisorActive: 3 })).toBe("SUPERVISOR_FULL");
    expect(checkPlacement({ ...base, activeOnPosting: 2 })).toBe("NO_SLOTS");
  });

  it("rejects backwards dates", () => {
    expect(checkPlacement({ ...base, endsOn: base.startsOn })).toBe("BAD_DATES");
  });
});

describe("links and slugs", () => {
  it("accepts only plain https links", () => {
    expect(cleanLink("https://github.com/ada")).toBe("https://github.com/ada");
    expect(cleanLink("http://example.com")).toBeNull();
    expect(cleanLink("javascript:alert(1)")).toBeNull();
    expect(cleanLink("data:text/html,<script>1</script>")).toBeNull();
    expect(cleanLink("https://user:pass@example.com")).toBeNull();
    expect(cleanLink("not a link")).toBeNull();
  });

  it("makes safe slugs and reserves the fixed route names", () => {
    expect(slugify("Web & Mobile Intern (Kigali)!")).toBe("web-mobile-intern-kigali");
    expect(slugify("  ---  ")).toBe("");
    expect(RESERVED_SLUGS.has("applications")).toBe(true);
    expect(RESERVED_SLUGS.has("placements")).toBe(true);
  });
});
