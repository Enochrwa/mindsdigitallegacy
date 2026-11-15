import { describe, expect, it } from "vitest";
import {
  buildLayout,
  cleanBlocks,
  dateToIso,
  diffSettings,
  emptyBlock,
  exportUrl,
  extractYouTubeId,
  failureMessage,
  failureProblems,
  formatDuration,
  isGateFailure,
  isOverdue,
  isSlug,
  moveItem,
  moveLesson,
  moveLessonToSection,
  parseDuration,
  parseList,
  qs,
  settingsIssues,
  slugify,
} from "./admin";
import type { PlatformSettings } from "./admin";
import type { ApiFailure } from "./api";

const rejected = (
  status: number,
  code: string,
  problems: { path: string; message: string }[] = [],
) => ({ ok: false, reason: "rejected", status, code, problems }) satisfies ApiFailure;

describe("qs", () => {
  it("drops empty values and encodes the rest", () => {
    expect(qs({ a: "x y", b: "", c: undefined, d: null, e: 0, f: false })).toBe(
      "?a=x+y&e=0&f=false",
    );
    expect(qs()).toBe("");
    expect(qs({ q: "   " })).toBe("");
  });
});

describe("exportUrl", () => {
  it("keeps only filters the server honours", () => {
    expect(exportUrl("leads", { status: "new", bogus: "1" })).toBe(
      "/api/v1/admin/export/leads?status=new",
    );
    expect(exportUrl("users", { q: "x" })).toBe("/api/v1/admin/export/users");
  });
});

describe("error mapping", () => {
  it("recognises the second-factor gates", () => {
    expect(isGateFailure(rejected(403, "MFA_REQUIRED"))).toBe(true);
    expect(isGateFailure(rejected(403, "MFA_SETUP_REQUIRED"))).toBe(true);
    expect(isGateFailure(rejected(409, "LAST_ADMIN"))).toBe(false);
    expect(isGateFailure({ ok: false, reason: "forbidden" })).toBe(false);
  });

  it("uses friendly wording and never raw server text", () => {
    expect(failureMessage(rejected(409, "LAST_ADMIN"))).toMatch(/at least one admin/);
    expect(failureMessage(rejected(409, "SOMETHING_NEW"))).toMatch(/conflicts/);
    expect(failureMessage(rejected(404, "X"))).toMatch(/no longer exists/);
    expect(failureMessage(rejected(418, "X"))).toMatch(/refused/);
    expect(failureMessage({ ok: false, reason: "network" })).toMatch(/could not reach/);
    expect(failureMessage({ ok: false, reason: "unavailable" })).toMatch(/our side/);
    expect(
      failureMessage({
        ok: false,
        reason: "validation",
        problems: [{ path: "slug", message: "bad" }],
      }),
    ).toBe("slug: bad");
  });

  it("lists publish problems", () => {
    expect(
      failureProblems(
        rejected(422, "NOT_PUBLISHABLE", [{ path: "course", message: "Publish a lesson" }]),
      ),
    ).toEqual(["Publish a lesson"]);
    expect(failureProblems({ ok: false, reason: "network" })).toEqual([]);
  });
});

describe("diffSettings", () => {
  const base: PlatformSettings = {
    referral: {
      enabled: true,
      threshold: 3,
      experiment: { enabled: false, thresholds: [3, 5] },
      maxQualifiedPerNetwork: 3,
      maxNewPerCodePerDay: 20,
      blockedEmailDomains: [],
    },
    registration: { open: true },
    announcement: { enabled: false, message: "" },
  };

  it("reports nothing when equal", () => {
    expect(diffSettings(base, structuredClone(base))).toEqual([]);
  });

  it("reports nested changes with their path", () => {
    const next = structuredClone(base);
    next.referral.threshold = 5;
    next.registration.open = false;
    next.referral.blockedEmailDomains = ["spam.example"];
    expect(diffSettings(base, next)).toEqual([
      { path: "referral.threshold", from: "3", to: "5" },
      { path: "referral.blockedEmailDomains", from: "0 items", to: "1 item" },
      { path: "registration.open", from: "true", to: "false" },
    ]);
  });

  it("compares arrays as a whole", () => {
    const next = structuredClone(base);
    next.referral.experiment.thresholds = [3, 7];
    expect(diffSettings(base, next)).toHaveLength(1);
  });

  it("validates like the server does", () => {
    expect(settingsIssues(base)).toEqual({});
    const bad = structuredClone(base);
    bad.referral.threshold = 0;
    bad.referral.maxNewPerCodePerDay = 501;
    bad.referral.experiment.thresholds = [3, 3];
    bad.referral.blockedEmailDomains = ["nodot"];
    bad.announcement = { enabled: true, message: "  " };
    expect(Object.keys(settingsIssues(bad)).sort()).toEqual([
      "announcement",
      "domains",
      "experiment",
      "threshold",
      "velocity",
    ]);
    const nan = structuredClone(base);
    nan.referral.threshold = Number.NaN;
    expect(settingsIssues(nan)["threshold"]).toBeDefined();
  });
});

describe("ordering helpers", () => {
  it("moves one step without mutating", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 2, 1)).toEqual(items);
    expect(moveItem(items, 9, 1)).toEqual(items);
    expect(items).toEqual(["a", "b", "c"]);
  });

  const sections = [
    { id: "s2", order: 2 },
    { id: "s1", order: 1 },
  ];
  const lessons = [
    { id: "l3", sectionId: "s2", order: 3 },
    { id: "l2", sectionId: "s1", order: 2 },
    { id: "l1", sectionId: "s1", order: 1 },
  ];

  it("builds the reading order the API expects", () => {
    expect(buildLayout(sections, lessons)).toEqual([
      { lessonId: "l1", sectionId: "s1" },
      { lessonId: "l2", sectionId: "s1" },
      { lessonId: "l3", sectionId: "s2" },
    ]);
  });

  it("swaps lessons only inside their own section", () => {
    const layout = buildLayout(sections, lessons);
    expect(moveLesson(layout, "l1", 1).map((e) => e.lessonId)).toEqual(["l2", "l1", "l3"]);
    expect(moveLesson(layout, "l2", 1)).toEqual(layout); // would cross into s2
    expect(moveLesson(layout, "l1", -1)).toEqual(layout);
    expect(moveLesson(layout, "missing", 1)).toEqual(layout);
  });

  it("moves a lesson to the end of another section", () => {
    const layout = buildLayout(sections, lessons);
    const next = moveLessonToSection(layout, sections, "l1", "s2");
    expect(next).toEqual([
      { lessonId: "l2", sectionId: "s1" },
      { lessonId: "l3", sectionId: "s2" },
      { lessonId: "l1", sectionId: "s2" },
    ]);
    expect(next).toHaveLength(layout.length);
  });
});

describe("blocks", () => {
  it("creates empty blocks of each type", () => {
    expect(emptyBlock("heading")).toEqual({ type: "heading", text: "" });
    expect(emptyBlock("list")).toMatchObject({ type: "list", items: [""] });
  });

  it("cleans blocks to what the API accepts", () => {
    expect(
      cleanBlocks([
        { type: "heading", text: "  Hi  " },
        { type: "paragraph", text: "   " },
        { type: "list", ordered: false, items: [" a ", "", "b"] },
        { type: "list", items: ["", " "] },
        { type: "code", language: " ", text: "x = 1\n\n" },
        { type: "note", tone: "warning", text: " careful " },
      ]),
    ).toEqual([
      { type: "heading", text: "Hi" },
      { type: "list", items: ["a", "b"] },
      { type: "code", text: "x = 1" },
      { type: "note", tone: "warning", text: "careful" },
    ]);
  });
});

describe("text parsing", () => {
  it("slugifies titles", () => {
    expect(slugify("  Hello, World! Ça va?  ")).toBe("hello-world-ca-va");
    expect(slugify("---")).toBe("");
    expect(slugify("a".repeat(120)).length).toBe(80);
    expect(isSlug("good-slug-1")).toBe(true);
    expect(isSlug("Bad Slug")).toBe(false);
    expect(isSlug("-x")).toBe(false);
    expect(isSlug("a")).toBe(false);
  });

  it("extracts YouTube ids from ids and links", () => {
    expect(extractYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(extractYouTubeId("short")).toBeNull();
    expect(extractYouTubeId("")).toBeNull();
  });

  it("parses durations", () => {
    expect(parseDuration("12:30")).toBe(750);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("90s")).toBe(90);
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("4:00:01")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
  });

  it("parses lists and dates", () => {
    expect(parseList("B, a\nb,,  c ")).toEqual(["b", "a", "c"]);
    expect(dateToIso("")).toBeNull();
    expect(dateToIso("2026-11-20")).toBe("2026-11-20T12:00:00.000Z");
    expect(dateToIso("nope")).toBeNull();
    expect(formatDuration(750)).toBe("12m 30s");
    expect(formatDuration(3723)).toBe("1h 2m");
    expect(isOverdue("2020-01-01T00:00:00Z", Date.parse("2026-01-01"))).toBe(true);
    expect(isOverdue(undefined)).toBe(false);
  });
});
