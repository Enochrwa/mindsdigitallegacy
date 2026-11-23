import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  facetsOf,
  facts,
  matchesText,
  normaliseSkill,
  paginate,
  passesFilters,
  similarTo,
  skillMatch,
  sortCandidates,
  tokens,
} from "./internships.discovery.js";
import type { Candidate, SearchQuery } from "./internships.discovery.js";
import { interviewProblem, validateAnswers } from "./internships.rules.js";
import type { Posting, ScreeningQuestion } from "./internships.types.js";

const NOW = new Date("2026-12-10T10:00:00Z");
const daysFromNow = (n: number): Date => new Date(NOW.getTime() + n * DAY_MS);

function posting(over: Partial<Posting> = {}): Posting {
  return {
    id: "p1",
    slug: "web-intern",
    title: "Web development intern",
    department: "software_web",
    summary: "Build features with our engineers.",
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
    skills: ["HTML", "CSS", "JavaScript"],
    responsibilities: [],
    whoCanApply: [],
    perks: [],
    screeningQuestions: [],
    supervisorIds: ["s1"],
    status: "published",
    createdBy: "a",
    createdAt: daysFromNow(-20),
    updatedAt: daysFromNow(-20),
    publishedAt: daysFromNow(-3),
    ...over,
  };
}

const candidate = (over: Partial<Posting> = {}, applicants = 0, placesOpen = 2): Candidate => {
  const p = posting(over);
  const competition = { applicants, placesOpen };
  return { posting: p, competition, facts: facts(p, competition, NOW) };
};

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  sort: "newest",
  page: 1,
  pageSize: 12,
  ...over,
});

describe("skill matching", () => {
  it("counts the skills the person lists, ignoring case and spacing", () => {
    expect(skillMatch(["html", " CSS "], ["HTML", "CSS", "JavaScript"])).toEqual({
      percent: 67,
      matched: ["HTML", "CSS"],
      missing: ["JavaScript"],
    });
  });

  it("understands common spellings of the same skill", () => {
    expect(normaliseSkill("JS")).toBe("javascript");
    expect(normaliseSkill("MS Excel")).toBe("excel");
    expect(skillMatch(["js", "ui/ux"], ["JavaScript", "UI UX"]).percent).toBe(100);
  });

  it("matches everyone when the posting lists no skills, and nobody when they list none", () => {
    expect(skillMatch([], [])).toEqual({ percent: 100, matched: [], missing: [] });
    expect(skillMatch([], ["HTML"]).percent).toBe(0);
  });
});

describe("facts shown on a card", () => {
  it("marks new postings, closing ones and early applicants", () => {
    const fresh = facts(
      posting({ publishedAt: daysFromNow(-2), closesAt: daysFromNow(3) }),
      { applicants: 1, placesOpen: 2 },
      NOW,
    );
    expect(fresh).toMatchObject({
      isNew: true,
      closingSoon: true,
      daysLeft: 3,
      earlyApplicant: true,
      postedDaysAgo: 2,
    });
    const old = facts(
      posting({ publishedAt: daysFromNow(-30), closesAt: daysFromNow(20) }),
      { applicants: 40, placesOpen: 2 },
      NOW,
    );
    expect(old).toMatchObject({
      isNew: false,
      closingSoon: false,
      daysLeft: 20,
      earlyApplicant: false,
    });
  });

  it("has no deadline facts when there is no deadline, and never calls a passed one 'soon'", () => {
    expect(facts(posting(), { applicants: 0, placesOpen: 1 }, NOW).daysLeft).toBeNull();
    expect(
      facts(posting({ closesAt: daysFromNow(-1) }), { applicants: 0, placesOpen: 1 }, NOW)
        .closingSoon,
    ).toBe(false);
  });
});

describe("text search", () => {
  it("splits what was typed into useful words", () => {
    expect(tokens("  React & Node.js, remote! ")).toEqual(["react", "node.js", "remote"]);
    expect(tokens("a")).toEqual([]);
    expect(tokens(undefined)).toEqual([]);
    expect(tokens("one two three four five six seven eight nine ten")).toHaveLength(8);
  });

  it("needs every word, found in the title, summary, skills, place or department", () => {
    const p = posting();
    expect(matchesText(p, tokens("web kigali"))).toBe(true);
    expect(matchesText(p, tokens("javascript"))).toBe(true);
    expect(matchesText(p, tokens("js"))).toBe(true); // alias of a listed skill
    expect(matchesText(p, tokens("web nairobi"))).toBe(false);
    expect(matchesText(p, [])).toBe(true);
  });
});

describe("filters", () => {
  const web = candidate({ id: "a" });
  const remoteDesign = candidate({
    id: "b",
    department: "design",
    mode: "remote",
    compensation: "stipend",
    durationWeeks: 12,
    minAge: 18,
    skills: ["Figma"],
    title: "Design intern",
  });

  it("keeps a posting only if it passes every filter", () => {
    expect(passesFilters(web, query())).toBe(true);
    expect(passesFilters(remoteDesign, query({ department: ["software_web"] }))).toBe(false);
    expect(passesFilters(remoteDesign, query({ mode: ["remote", "hybrid"] }))).toBe(true);
    expect(passesFilters(remoteDesign, query({ compensation: ["unpaid"] }))).toBe(false);
    expect(passesFilters(remoteDesign, query({ maxWeeks: 8 }))).toBe(false);
    expect(passesFilters(web, query({ maxWeeks: 8 }))).toBe(true);
    expect(passesFilters(remoteDesign, query({ openToUnder18: true }))).toBe(false);
    expect(passesFilters(web, query({ openToUnder18: true }))).toBe(true);
    expect(passesFilters(remoteDesign, query({ q: "figma" }))).toBe(true);
    expect(passesFilters(web, query({ q: "figma" }))).toBe(false);
  });

  it("treats empty lists as 'anything', and respects the closing-soon and start-by filters", () => {
    expect(passesFilters(web, query({ department: [], mode: [], compensation: [] }))).toBe(true);
    const soon = candidate({ closesAt: daysFromNow(2) });
    expect(passesFilters(soon, query({ closingSoon: true }))).toBe(true);
    expect(passesFilters(web, query({ closingSoon: true }))).toBe(false);
    const later = candidate({ startsOn: daysFromNow(40) });
    expect(passesFilters(later, query({ startsBy: daysFromNow(10) }))).toBe(false);
    expect(passesFilters(later, query({ startsBy: daysFromNow(60) }))).toBe(true);
    expect(passesFilters(web, query({ startsBy: daysFromNow(10) }))).toBe(true); // no fixed start: always fine
  });
});

describe("sorting", () => {
  const list = [
    candidate(
      { id: "old", publishedAt: daysFromNow(-10), durationWeeks: 12, closesAt: daysFromNow(20) },
      0,
      1,
    ),
    candidate(
      { id: "new", publishedAt: daysFromNow(-1), durationWeeks: 4, closesAt: daysFromNow(2) },
      0,
      5,
    ),
    candidate({ id: "open", publishedAt: daysFromNow(-5), durationWeeks: 8 }, 0, 3),
  ];
  const ids = (sort: SearchQuery["sort"]): string[] =>
    sortCandidates(list, sort).map((c) => c.posting.id);

  it("orders by newest, soonest deadline (none last), shortest and most places", () => {
    expect(ids("newest")).toEqual(["new", "open", "old"]);
    expect(ids("closing")).toEqual(["new", "old", "open"]);
    expect(ids("shortest")).toEqual(["new", "open", "old"]);
    expect(ids("most_places")).toEqual(["new", "open", "old"]);
  });

  it("orders by best match, newest first among ties, and never mutates its input", () => {
    const withMatch = list.map((c, i) => ({
      ...c,
      match: skillMatch(i === 0 ? ["HTML", "CSS", "JS"] : ["HTML"], c.posting.skills),
    }));
    expect(sortCandidates(withMatch, "best_match").map((c) => c.posting.id)).toEqual([
      "old",
      "new",
      "open",
    ]);
    expect(list.map((c) => c.posting.id)).toEqual(["old", "new", "open"]);
  });
});

describe("facets, paging and similar postings", () => {
  it("counts postings under each filter option", () => {
    const f = facetsOf([
      candidate({ id: "1" }),
      candidate({ id: "2", mode: "remote" }),
      candidate({ id: "3", department: "design" }),
    ]);
    expect(f.department).toEqual({ software_web: 2, design: 1 });
    expect(f.mode).toEqual({ hybrid: 2, remote: 1 });
    expect(f.compensation).toEqual({ unpaid: 3 });
  });

  it("pages results", () => {
    const items = [1, 2, 3, 4, 5];
    expect(paginate(items, 1, 2)).toEqual([1, 2]);
    expect(paginate(items, 3, 2)).toEqual([5]);
    expect(paginate(items, 9, 2)).toEqual([]);
  });

  it("suggests the same department first, then shared skills, never the posting itself", () => {
    const target = posting({ id: "t", department: "software_web", skills: ["HTML"] });
    const pool = [
      target,
      posting({ id: "same", department: "software_web", skills: [] }),
      posting({ id: "skill", department: "design", skills: ["html"] }),
      posting({ id: "none", department: "design", skills: ["Figma"] }),
    ];
    expect(similarTo(target, pool).map((p) => p.id)).toEqual(["same", "skill"]);
    expect(similarTo(target, pool, 1)).toHaveLength(1);
  });
});

describe("screening answers", () => {
  const questions: ScreeningQuestion[] = [
    { id: "why", label: "Why this role?", kind: "text", required: true },
    { id: "laptop", label: "Do you have a laptop?", kind: "yes_no", required: true },
    {
      id: "slot",
      label: "Preferred days?",
      kind: "choice",
      required: false,
      options: ["Mon-Wed", "Thu-Fri"],
    },
  ];

  it("accepts good answers, trims them, and treats blanks as not answered", () => {
    const r = validateAnswers(questions, [
      { questionId: "why", answer: "  I love building things  " },
      { questionId: "laptop", answer: "yes" },
      { questionId: "slot", answer: "" },
    ]);
    expect(r).toEqual({
      ok: true,
      answers: [
        { questionId: "why", answer: "I love building things" },
        { questionId: "laptop", answer: "yes" },
      ],
    });
  });

  it("refuses missing required, unknown, duplicate and invalid answers", () => {
    expect(validateAnswers(questions, [{ questionId: "laptop", answer: "yes" }])).toMatchObject({
      ok: false,
      problem: { code: "MISSING_ANSWER", questionId: "why" },
    });
    expect(validateAnswers(questions, [{ questionId: "nope", answer: "x" }])).toMatchObject({
      ok: false,
      problem: { code: "UNKNOWN_QUESTION" },
    });
    expect(
      validateAnswers(questions, [
        { questionId: "why", answer: "a" },
        { questionId: "why", answer: "b" },
      ]),
    ).toMatchObject({ ok: false, problem: { code: "DUPLICATE_ANSWER" } });
    const base = [{ questionId: "why", answer: "ok" }];
    expect(
      validateAnswers(questions, [...base, { questionId: "laptop", answer: "maybe" }]),
    ).toMatchObject({ ok: false, problem: { code: "BAD_ANSWER" } });
    expect(
      validateAnswers(questions, [
        ...base,
        { questionId: "laptop", answer: "yes" },
        { questionId: "slot", answer: "Sat" },
      ]),
    ).toMatchObject({ ok: false, problem: { code: "BAD_ANSWER" } });
    expect(
      validateAnswers(questions, [
        { questionId: "why", answer: "x".repeat(501) },
        { questionId: "laptop", answer: "no" },
      ]),
    ).toMatchObject({ ok: false, problem: { code: "BAD_ANSWER" } });
  });

  it("needs nothing when the posting asks nothing", () => {
    expect(validateAnswers([], [])).toEqual({ ok: true, answers: [] });
  });
});

describe("interview details", () => {
  const base = {
    at: daysFromNow(2),
    mode: "online" as const,
    where: "https://meet.example.com/abc",
  };
  it("must be in the future, have a place, and an https link when online", () => {
    expect(interviewProblem(base, NOW)).toBeNull();
    expect(interviewProblem({ ...base, at: daysFromNow(-1) }, NOW)).toBe("PAST");
    expect(interviewProblem({ ...base, where: "  " }, NOW)).toBe("EMPTY_PLACE");
    expect(interviewProblem({ ...base, where: "http://insecure.example" }, NOW)).toBe("BAD_LINK");
    expect(
      interviewProblem({ ...base, mode: "onsite", where: "MDL office, KG 7 Ave" }, NOW),
    ).toBeNull();
    expect(interviewProblem({ ...base, mode: "phone", where: "+250 788 000 000" }, NOW)).toBeNull();
  });
});
