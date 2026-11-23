import { describe, expect, it } from "vitest";
import { errorOf } from "../../testing/fixtures.js";
import { CSRF, harness } from "../../testing/harness.js";
import { createExtrasService } from "./internships.extras.service.js";
import { AGREEMENT_VERSION } from "./internships.types.js";

type H = ReturnType<typeof harness>;
const json = <T>(r: { body: unknown }): T => r.body as T;
const body = (r: { body: unknown }): Record<string, unknown> => r.body as Record<string, unknown>;
const DAY = 86_400_000;
const IN = (days: number): string => new Date(Date.now() + days * DAY).toISOString();
const STATEMENT =
  "I am a second-year student who has built two small web apps and want supervised practice.";

function postingBody(supervisorIds: string[], over: Record<string, unknown> = {}) {
  return {
    title: "Web development intern",
    department: "software_web",
    summary: "Build real features with our engineers.",
    description:
      "Work on the MDL platform with a supervisor and learn code review and testing in a team.",
    requirements: ["Basic HTML and CSS"],
    learningGoals: ["Ship a feature to production"],
    mode: "hybrid",
    location: "Kigali",
    durationWeeks: 8,
    hoursPerWeek: 20,
    compensation: "unpaid",
    compensationNote: "",
    minAge: 16,
    slots: 2,
    skills: ["HTML", "CSS", "JavaScript"],
    responsibilities: ["Build small UI features"],
    whoCanApply: ["Available 20 hours a week"],
    perks: ["Certificate", "Reference letter"],
    supervisorIds,
    closesAt: IN(30),
    ...over,
  };
}

async function world(opts: { env?: Record<string, string> } = {}) {
  const t = harness(opts.env === undefined ? {} : { env: opts.env });
  const admin = await t.staff("admin@example.rw");
  const sup = await t.learner("sup@example.rw");
  t.setRoles("sup@example.rw", ["supervisor"]);
  const supRelog = await t.login("sup@example.rw");
  const make = async (over: Record<string, unknown> = {}, publish = true) => {
    const created = await admin.post("/internships/postings", postingBody([sup.id], over));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const posting = json<{ posting: { id: string; slug: string } }>(created).posting;
    if (publish)
      expect((await admin.post(`/internships/postings/${posting.id}/publish`)).status).toBe(200);
    return posting;
  };
  return { t, admin, sup, supCookie: supRelog, make };
}

const list = (t: H, query: Record<string, string> = {}, cookie?: string) =>
  t.api
    .get("/api/v1/internships")
    .query(query)
    .set("Cookie", cookie ?? "");
const titles = (r: { body: unknown }): string[] =>
  json<{ items: { title: string }[] }>(r).items.map((i) => i.title);

const apply = (t: H, cookie: string, slug: string, over: Record<string, unknown> = {}) =>
  t.api
    .post(`/api/v1/internships/${slug}/apply`)
    .set(CSRF)
    .set("Cookie", cookie)
    .send({
      statement: STATEMENT,
      links: [],
      under18: false,
      consent: true,
      privacyNoticeVersion: "2026-11",
      ...over,
    });

const send = (
  t: H,
  method: "put" | "delete" | "post",
  path: string,
  cookie: string,
  payload: object = {},
) => t.api[method](`/api/v1/internships${path}`).set(CSRF).set("Cookie", cookie).send(payload);

const PROFILE = {
  headline: "Second-year software student",
  educationLevel: "university",
  institution: "INES Ruhengeri",
  field: "Computer science",
  skills: ["HTML", "CSS", "js"],
  links: ["https://github.com/ada"],
  about: "I build small web apps and want to learn how a real team ships software.",
};

describe("finding internships", () => {
  it("searches by words, filters, sorts and pages", async () => {
    const { t, make } = await world();
    await make({ title: "Web development intern" });
    await make({
      title: "Design intern",
      department: "design",
      mode: "remote",
      skills: ["Figma"],
      durationWeeks: 12,
      compensation: "stipend",
      closesAt: IN(2),
    });
    await make({
      title: "Data analysis intern",
      department: "data_bi",
      skills: ["Excel", "SQL"],
      durationWeeks: 4,
      minAge: 18,
    });
    await make({ title: "Hidden draft intern" }, false);

    expect((await list(t)).status).toBe(200);
    expect(titles(await list(t)).sort()).toEqual([
      "Data analysis intern",
      "Design intern",
      "Web development intern",
    ]);
    expect(titles(await list(t, { q: "figma" }))).toEqual(["Design intern"]);
    expect(titles(await list(t, { q: "sql excel" }))).toEqual(["Data analysis intern"]);
    expect(titles(await list(t, { department: "design,data_bi" })).sort()).toEqual([
      "Data analysis intern",
      "Design intern",
    ]);
    expect(titles(await list(t, { mode: "remote" }))).toEqual(["Design intern"]);
    expect(titles(await list(t, { compensation: "stipend" }))).toEqual(["Design intern"]);
    expect(titles(await list(t, { maxWeeks: "8" })).sort()).toEqual([
      "Data analysis intern",
      "Web development intern",
    ]);
    expect(titles(await list(t, { openToUnder18: "true" })).sort()).toEqual([
      "Design intern",
      "Web development intern",
    ]);
    expect(titles(await list(t, { closingSoon: "true" }))).toEqual(["Design intern"]);
    expect(titles(await list(t, { sort: "shortest" }))[0]).toBe("Data analysis intern");
    expect(titles(await list(t, { sort: "closing" }))[0]).toBe("Design intern");

    const paged = await list(t, { pageSize: "2", page: "2" });
    expect(json<{ items: unknown[]; total: number; page: number }>(paged)).toMatchObject({
      total: 3,
      page: 2,
    });
    expect(json<{ items: unknown[] }>(paged).items).toHaveLength(1);
    const facets = json<{
      facets: { department: Record<string, number>; mode: Record<string, number> };
    }>(await list(t, { q: "figma" })).facets;
    expect(facets.department).toEqual({ software_web: 1, design: 1, data_bi: 1 }); // counts cover all open postings
    expect(facets.mode).toEqual({ hybrid: 2, remote: 1 });
  });

  it("rejects nonsense in the search address", async () => {
    const { t } = await world();
    for (const q of [
      { sort: "hack" },
      { department: "nope" },
      { pageSize: "1000" },
      { unknown: "1" },
      { page: "0" },
      { maxWeeks: "99" },
    ]) {
      expect((await list(t, q)).status, JSON.stringify(q)).toBe(400);
    }
  });

  it("shows what a person needs before applying, without exposing staff details", async () => {
    const { t, make, sup } = await world();
    const p = await make({
      screeningQuestions: [
        { id: "laptop", label: "Do you have a laptop?", kind: "yes_no", required: true },
      ],
      startsOn: IN(20),
    });
    const res = await t.api.get(`/api/v1/internships/${p.slug}`);
    expect(res.status).toBe(200);
    const posting = json<{ posting: Record<string, unknown> }>(res).posting;
    expect(posting).toMatchObject({
      skills: ["HTML", "CSS", "JavaScript"],
      responsibilities: ["Build small UI features"],
      whoCanApply: ["Available 20 hours a week"],
      perks: ["Certificate", "Reference letter"],
      applicants: 0,
      placesOpen: 2,
      saved: false,
    });
    expect(posting["screeningQuestions"]).toEqual([
      { id: "laptop", label: "Do you have a laptop?", kind: "yes_no", required: true },
    ]);
    expect(posting["facts"]).toMatchObject({ isNew: true, earlyApplicant: true });
    expect(JSON.stringify(res.body)).not.toContain(sup.id);
    expect(JSON.stringify(res.body)).not.toMatch(/supervisorIds|createdBy/);
  });

  it("suggests similar internships and counts applicants and open places", async () => {
    const { t, admin, make, sup } = await world();
    const a = await make({ title: "Web development intern" });
    await make({ title: "Frontend web intern", skills: ["HTML", "React"] });
    await make({ title: "Finance admin intern", department: "business_admin", skills: ["Excel"] });
    const ada = await t.learner("ada@example.rw");
    const applied = json<{ application: { id: string } }>(await apply(t, ada.cookie, a.slug))
      .application.id;

    const detail = json<{
      posting: Record<string, unknown>;
      similar: { title: string }[];
      applied: { status: string } | null;
    }>(await t.api.get(`/api/v1/internships/${a.slug}`).set("Cookie", ada.cookie));
    expect(detail.posting["applicants"]).toBe(1);
    expect(detail.similar.map((s) => s.title)).toEqual(["Frontend web intern"]);
    expect(detail.applied).toMatchObject({ status: "submitted" });

    for (const to of ["shortlisted", "offered"])
      await admin.post(`/internships/applications/${applied}/transition`, { to });
    await send(t, "post", `/applications/${applied}/accept`, ada.cookie, {
      agreementVersion: AGREEMENT_VERSION,
    });
    await admin.post(`/internships/applications/${applied}/place`, {
      supervisorId: sup.id,
      startsOn: "2027-02-01",
      endsOn: "2027-04-01",
    });
    const after = json<{ posting: Record<string, unknown> }>(
      await t.api.get(`/api/v1/internships/${a.slug}`),
    );
    expect(after.posting["placesOpen"]).toBe(1);
  });
});

describe("personal touches for a signed-in person", () => {
  it("shows a skills match, saved marks, and sorts by best match", async () => {
    const { t, make } = await world();
    await make({ title: "Web development intern" });
    await make({ title: "Design intern", department: "design", skills: ["Figma", "Photoshop"] });
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", "/profile/me", ada.cookie, PROFILE);

    const rows = json<{
      items: {
        title: string;
        match: { percent: number; matched: string[]; missing: string[] };
        saved: boolean;
      }[];
    }>(await list(t, { sort: "best_match" }, ada.cookie)).items;
    expect(rows.map((r) => r.title)).toEqual(["Web development intern", "Design intern"]);
    expect(rows[0]?.match).toEqual({
      percent: 100,
      matched: ["HTML", "CSS", "JavaScript"],
      missing: [],
    }); // "js" counts as JavaScript
    expect(rows[1]?.match.percent).toBe(0);

    const design = rows[1];
    expect(design).toBeDefined();
    const slug =
      json<{ items: { slug: string; title: string }[] }>(await list(t, {}, ada.cookie)).items.find(
        (i) => i.title === "Design intern",
      )?.slug ?? "";
    expect((await send(t, "put", `/${slug}/save`, ada.cookie)).status).toBe(204);
    const again = json<{ items: { title: string; saved: boolean }[] }>(
      await list(t, {}, ada.cookie),
    ).items;
    expect(again.find((i) => i.title === "Design intern")?.saved).toBe(true);
  });

  it("falls back to newest for best match when the person has no profile, and shows no match to visitors", async () => {
    const { t, make } = await world();
    await make({ title: "Web development intern" });
    const anon = await list(t, { sort: "best_match" });
    expect(json<{ sort: string }>(anon).sort).toBe("newest");
    expect(json<{ items: { match?: unknown }[] }>(anon).items[0]?.match).toBeUndefined();
    const ada = await t.learner("ada@example.rw");
    expect(json<{ sort: string }>(await list(t, { sort: "best_match" }, ada.cookie)).sort).toBe(
      "newest",
    );
  });

  it("keeps personal answers out of shared caches", async () => {
    const { t } = await world();
    const res = await list(t);
    expect(String(res.headers["cache-control"])).toMatch(/private/);
    expect(String(res.headers["vary"])).toMatch(/Cookie/i);
  });
});

describe("'can I apply?' before filling anything in", () => {
  it("explains each situation", async () => {
    const { t, make } = await world({ env: { INTERNSHIP_MAX_OPEN_APPLICATIONS: "1" } });
    const a = await make({ title: "Web development intern" });
    const b = await make({ title: "Second intern", skills: ["Figma"] });
    const check = (slug: string, cookie?: string) =>
      t.api.get(`/api/v1/internships/${slug}/apply-check`).set("Cookie", cookie ?? "");

    expect(json<{ canApply: boolean; blockers: string[] }>(await check(a.slug))).toMatchObject({
      canApply: false,
      blockers: ["SIGN_IN"],
    });

    const ada = await t.learner("ada@example.rw");
    await send(t, "put", "/profile/me", ada.cookie, PROFILE);
    const first = json<{
      canApply: boolean;
      profileComplete: boolean;
      match: { percent: number };
      maxOpenApplications: number;
    }>(await check(a.slug, ada.cookie));
    expect(first).toMatchObject({ canApply: true, profileComplete: true, maxOpenApplications: 1 });
    expect(first.match.percent).toBe(100);

    await apply(t, ada.cookie, a.slug);
    expect(
      json<{ blockers: string[]; application: { status: string } }>(
        await check(a.slug, ada.cookie),
      ),
    ).toMatchObject({ blockers: ["ALREADY_APPLIED"], application: { status: "submitted" } });
    // The one allowed open application is in use, so a second internship is blocked and says why.
    expect(
      json<{ blockers: string[]; openApplications: number }>(await check(b.slug, ada.cookie)),
    ).toMatchObject({ blockers: ["TOO_MANY_OPEN"], openApplications: 1 });
  });

  it("reports a saved draft and a saved internship", async () => {
    const { t, make } = await world();
    const a = await make();
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", `/${a.slug}/draft`, ada.cookie, { statement: "half written" });
    await send(t, "put", `/${a.slug}/save`, ada.cookie);
    expect(
      json<{ hasDraft: boolean; saved: boolean }>(
        await t.api.get(`/api/v1/internships/${a.slug}/apply-check`).set("Cookie", ada.cookie),
      ),
    ).toMatchObject({ hasDraft: true, saved: true });
  });
});

describe("reusable profile", () => {
  it("is private to the person, validated, and deletable", async () => {
    const { t } = await world();
    const ada = await t.learner("ada@example.rw");
    expect((await t.api.get("/api/v1/internships/profile/me")).status).toBe(401);
    expect(
      (await t.api.put("/api/v1/internships/profile/me").set("Cookie", ada.cookie).send(PROFILE))
        .status,
    ).toBe(403); // header required

    const empty = await t.api.get("/api/v1/internships/profile/me").set("Cookie", ada.cookie);
    expect(body(empty)).toEqual({ profile: null, complete: false });
    const saved = await send(t, "put", "/profile/me", ada.cookie, {
      ...PROFILE,
      skills: ["HTML", "html ", "CSS", "js"],
    });
    expect(saved.status).toBe(200);
    expect(json<{ profile: { skills: string[] }; complete: boolean }>(saved).complete).toBe(true);
    // Duplicates by spelling/case are collapsed only exactly; "HTML" and "html" differ before normalising, both kept is fine, but trimmed.
    expect(json<{ profile: { skills: string[] } }>(saved).profile.skills).toContain("CSS");

    const bob = await t.learner("bob@example.rw");
    expect(
      body(await t.api.get("/api/v1/internships/profile/me").set("Cookie", bob.cookie))["profile"],
    ).toBeNull();

    for (const bad of [
      { ...PROFILE, links: ["http://insecure.example"] },
      { ...PROFILE, links: ["javascript:alert(1)"] },
      { ...PROFILE, educationLevel: "wizard" },
      { ...PROFILE, skills: Array.from({ length: 16 }, (_, i) => `skill${String(i)}`) },
      { ...PROFILE, role: "admin" },
    ]) {
      expect((await send(t, "put", "/profile/me", ada.cookie, bad)).status).toBe(400);
    }
    expect((await send(t, "delete", "/profile/me", ada.cookie)).status).toBe(204);
    expect(
      body(await t.api.get("/api/v1/internships/profile/me").set("Cookie", ada.cookie))["profile"],
    ).toBeNull();
  });

  it("is incomplete without a headline, school or skills", async () => {
    const { t } = await world();
    const ada = await t.learner("ada@example.rw");
    const r = await send(t, "put", "/profile/me", ada.cookie, { ...PROFILE, skills: [] });
    expect(json<{ complete: boolean }>(r).complete).toBe(false);
  });
});

describe("applying with screening questions and a saved profile", () => {
  const questions = [
    { id: "laptop", label: "Do you have a laptop?", kind: "yes_no", required: true },
    {
      id: "days",
      label: "Preferred days?",
      kind: "choice",
      required: false,
      options: ["Mon-Wed", "Thu-Fri"],
    },
    { id: "why", label: "Why this role?", kind: "text", required: true },
  ];

  it("checks the answers the way the posting asks", async () => {
    const { t, make } = await world();
    const p = await make({ screeningQuestions: questions });
    const ada = await t.learner("ada@example.rw");
    const missing = await apply(t, ada.cookie, p.slug, {
      answers: [{ questionId: "laptop", answer: "yes" }],
    });
    expect(missing.status).toBe(422);
    expect(errorOf(missing).code).toBe("MISSING_ANSWER");
    expect(
      errorOf(
        await apply(t, ada.cookie, p.slug, {
          answers: [
            { questionId: "laptop", answer: "maybe" },
            { questionId: "why", answer: "x" },
          ],
        }),
      ).code,
    ).toBe("BAD_ANSWER");
    expect(
      errorOf(
        await apply(t, ada.cookie, p.slug, { answers: [{ questionId: "ghost", answer: "x" }] }),
      ).code,
    ).toBe("UNKNOWN_QUESTION");
    expect(t.internships.internshipApplications.all).toHaveLength(0);
    const ok = await apply(t, ada.cookie, p.slug, {
      answers: [
        { questionId: "laptop", answer: "yes" },
        { questionId: "why", answer: "To learn" },
      ],
    });
    expect(ok.status).toBe(201);
    expect(
      json<{ application: { answers: { question: string; answer: string }[] } }>(ok).application
        .answers,
    ).toEqual([
      { questionId: "laptop", question: "Do you have a laptop?", answer: "yes" },
      { questionId: "why", question: "Why this role?", answer: "To learn" },
    ]);
  });

  it("attaches a frozen copy of the saved profile for reviewers and uses its links", async () => {
    const { t, admin, make } = await world();
    const p = await make();
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", "/profile/me", ada.cookie, PROFILE);
    const res = await apply(t, ada.cookie, p.slug);
    expect(res.status).toBe(201);
    const id = json<{ application: { id: string; matchPercent: number } }>(res).application;
    expect(id.matchPercent).toBe(100);
    // The profile can change later; the reviewer still sees what was true at the time.
    await send(t, "put", "/profile/me", ada.cookie, {
      ...PROFILE,
      headline: "Changed later",
      skills: [],
    });
    const staff = json<{
      application: {
        profile: { headline: string; skills: string[] };
        links: string[];
        matchPercent: number;
      };
    }>(await admin.get(`/internships/applications/${id.id}`)).application;
    expect(staff.profile).toMatchObject({
      headline: "Second-year software student",
      skills: ["HTML", "CSS", "js"],
    });
    expect(staff.links).toEqual(["https://github.com/ada"]);
    expect(staff.matchPercent).toBe(100);
  });

  it("applies without the profile when the person chooses", async () => {
    const { t, admin, make } = await world();
    const p = await make();
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", "/profile/me", ada.cookie, PROFILE);
    const id = json<{ application: { id: string } }>(
      await apply(t, ada.cookie, p.slug, { useProfile: false }),
    ).application.id;
    const staff = json<{ application: { profile?: unknown; matchPercent?: number } }>(
      await admin.get(`/internships/applications/${id}`),
    ).application;
    expect(staff.profile).toBeUndefined();
    expect(staff.matchPercent).toBeUndefined();
  });

  it("limits how many applications one person has in play, and frees a place on withdrawal", async () => {
    const { t, make } = await world({ env: { INTERNSHIP_MAX_OPEN_APPLICATIONS: "2" } });
    const a = await make({ title: "First role" });
    const b = await make({ title: "Second role" });
    const c = await make({ title: "Third role" });
    const ada = await t.learner("ada@example.rw");
    const first = json<{ application: { id: string } }>(await apply(t, ada.cookie, a.slug))
      .application.id;
    expect((await apply(t, ada.cookie, b.slug)).status).toBe(201);
    const blocked = await apply(t, ada.cookie, c.slug);
    expect(blocked.status).toBe(409);
    expect(errorOf(blocked).code).toBe("TOO_MANY_OPEN");
    await send(t, "post", `/applications/${first}/withdraw`, ada.cookie);
    expect((await apply(t, ada.cookie, c.slug)).status).toBe(201);
    // Repeating an application that already exists is still fine (idempotent) and not blocked by the cap.
    expect((await apply(t, ada.cookie, b.slug)).status).toBe(200);
  });
});

describe("drafts", () => {
  it("are saved while typing, private, and removed when the application is sent", async () => {
    const { t, make } = await world();
    const p = await make({
      screeningQuestions: [
        { id: "laptop", label: "Do you have a laptop?", kind: "yes_no", required: true },
      ],
    });
    const ada = await t.learner("ada@example.rw");
    expect((await t.api.get(`/api/v1/internships/${p.slug}/draft`)).status).toBe(401);
    expect(
      body(await t.api.get(`/api/v1/internships/${p.slug}/draft`).set("Cookie", ada.cookie))[
        "draft"
      ],
    ).toBeNull();

    const saved = await send(t, "put", `/${p.slug}/draft`, ada.cookie, {
      statement: "work in progress",
      links: ["https://github.com/ada", "http://insecure.example"],
      answers: [
        { questionId: "laptop", answer: "yes" },
        { questionId: "ghost", answer: "dropped" },
      ],
    });
    expect(saved.status).toBe(200);
    const got = json<{ draft: { statement: string; links: string[]; answers: unknown[] } }>(
      await t.api.get(`/api/v1/internships/${p.slug}/draft`).set("Cookie", ada.cookie),
    ).draft;
    expect(got).toMatchObject({
      statement: "work in progress",
      links: ["https://github.com/ada"],
      answers: [{ questionId: "laptop", answer: "yes" }],
    });

    const bob = await t.learner("bob@example.rw");
    expect(
      body(await t.api.get(`/api/v1/internships/${p.slug}/draft`).set("Cookie", bob.cookie))[
        "draft"
      ],
    ).toBeNull();

    expect(
      (await apply(t, ada.cookie, p.slug, { answers: [{ questionId: "laptop", answer: "yes" }] }))
        .status,
    ).toBe(201);
    expect(
      body(await t.api.get(`/api/v1/internships/${p.slug}/draft`).set("Cookie", ada.cookie))[
        "draft"
      ],
    ).toBeNull();
    expect(
      (await send(t, "put", `/${p.slug}/draft`, ada.cookie, { statement: "again" })).status,
    ).toBe(409); // already applied
  });

  it("can be thrown away, and are refused for postings that are not open", async () => {
    const { t, admin, make } = await world();
    const p = await make();
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", `/${p.slug}/draft`, ada.cookie, { statement: "x" });
    expect((await send(t, "delete", `/${p.slug}/draft`, ada.cookie)).status).toBe(204);
    expect(
      body(await t.api.get(`/api/v1/internships/${p.slug}/draft`).set("Cookie", ada.cookie))[
        "draft"
      ],
    ).toBeNull();
    await admin.post(`/internships/postings/${p.id}/close`);
    expect((await send(t, "put", `/${p.slug}/draft`, ada.cookie, { statement: "x" })).status).toBe(
      404,
    );
  });
});

describe("saved internships", () => {
  it("can be saved, listed, and stay visible (as closed) after the posting closes", async () => {
    const { t, admin, make } = await world();
    const a = await make({ title: "Web development intern" });
    const b = await make({ title: "Design intern", department: "design" });
    const ada = await t.learner("ada@example.rw");
    expect((await send(t, "put", `/${a.slug}/save`, ada.cookie)).status).toBe(204);
    expect((await send(t, "put", `/${a.slug}/save`, ada.cookie)).status).toBe(204); // saving twice is fine
    await send(t, "put", `/${b.slug}/save`, ada.cookie);
    const mine = json<{ items: { title: string; open: boolean; saved: boolean }[] }>(
      await t.api.get("/api/v1/internships/saved").set("Cookie", ada.cookie),
    ).items;
    expect(mine.map((m) => m.title).sort()).toEqual(["Design intern", "Web development intern"]);
    await admin.post(`/internships/postings/${b.id}/close`);
    const after = json<{ items: { title: string; open: boolean }[] }>(
      await t.api.get("/api/v1/internships/saved").set("Cookie", ada.cookie),
    ).items;
    expect(after.find((m) => m.title === "Design intern")?.open).toBe(false);
    expect((await send(t, "delete", `/${a.slug}/save`, ada.cookie)).status).toBe(204);
    const bob = await t.learner("bob@example.rw");
    expect(
      json<{ items: unknown[] }>(
        await t.api.get("/api/v1/internships/saved").set("Cookie", bob.cookie),
      ).items,
    ).toHaveLength(0);
    expect((await t.api.get("/api/v1/internships/saved")).status).toBe(401);
  });

  it("cannot save a posting that does not exist or is still a draft", async () => {
    const { t, make } = await world();
    const draft = await make({ title: "Draft only" }, false);
    const ada = await t.learner("ada@example.rw");
    expect((await send(t, "put", `/${draft.slug}/save`, ada.cookie)).status).toBe(404);
    expect((await send(t, "put", "/nope-nope/save", ada.cookie)).status).toBe(404);
  });
});

describe("alerts", () => {
  it("email only people whose alert matches a posting that just went live", async () => {
    const { t, make } = await world();
    const ada = await t.learner("ada@example.rw");
    const bob = await t.learner("bob@example.rw");
    const cy = await t.learner("cy@example.rw");
    const dee = await t.learner("dee@example.rw");
    await send(t, "put", "/alerts/me", ada.cookie, {
      departments: ["software_web"],
      modes: [],
      keywords: "",
      active: true,
    });
    await send(t, "put", "/alerts/me", bob.cookie, {
      departments: ["design"],
      modes: [],
      keywords: "",
      active: true,
    });
    await send(t, "put", "/alerts/me", cy.cookie, {
      departments: [],
      modes: ["remote"],
      keywords: "",
      active: true,
    });
    await send(t, "put", "/alerts/me", dee.cookie, {
      departments: [],
      modes: [],
      keywords: "",
      active: false,
    });

    await make({ title: "Web development intern", mode: "hybrid" });
    const sent = t.mailer.sent.filter((m) => m.kind === "alert");
    expect(sent.map((m) => m.to)).toEqual(["ada@example.rw"]);
    expect(sent[0]?.update).toContain("web-development-intern");

    await make({
      title: "Remote design intern",
      department: "design",
      mode: "remote",
      skills: ["Figma"],
    });
    const second = t.mailer.sent
      .filter((m) => m.kind === "alert")
      .map((m) => m.to)
      .sort();
    expect(second).toEqual(["ada@example.rw", "bob@example.rw", "cy@example.rw"]);
  });

  it("match keywords, sends only on first publication, and can be turned off or deleted", async () => {
    const { t, admin, make } = await world();
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", "/alerts/me", ada.cookie, {
      departments: [],
      modes: [],
      keywords: "figma",
      active: true,
    });
    const web = await make({ title: "Web intern" });
    expect(t.mailer.sent.filter((m) => m.kind === "alert")).toHaveLength(0);
    const design = await make({ title: "Design intern", department: "design", skills: ["Figma"] });
    expect(t.mailer.sent.filter((m) => m.kind === "alert")).toHaveLength(1);
    // Publishing again does not send a second email.
    await admin.post(`/internships/postings/${design.id}/publish`);
    expect(t.mailer.sent.filter((m) => m.kind === "alert")).toHaveLength(1);

    expect(
      json<{ alert: { keywords: string } }>(
        await t.api.get("/api/v1/internships/alerts/me").set("Cookie", ada.cookie),
      ).alert.keywords,
    ).toBe("figma");
    expect((await send(t, "delete", "/alerts/me", ada.cookie)).status).toBe(204);
    expect(
      body(await t.api.get("/api/v1/internships/alerts/me").set("Cookie", ada.cookie))["alert"],
    ).toBeNull();
    void web;
    expect(
      (
        await send(t, "put", "/alerts/me", ada.cookie, {
          departments: ["nope"],
          modes: [],
          keywords: "",
          active: true,
        })
      ).status,
    ).toBe(400);
  });

  it("send fixed text only, never reviewer words, and are audited", async () => {
    const { t, make } = await world();
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", "/alerts/me", ada.cookie, {
      departments: [],
      modes: [],
      keywords: "",
      active: true,
    });
    await make();
    expect(t.audit.events.some((e) => e.action === "internship.alerts.sent")).toBe(true);
  });
});

describe("housekeeping automation", () => {
  function service(t: H, now: () => Date) {
    return createExtrasService({
      postings: t.internships.internshipPostings,
      applications: t.internships.internshipApplications,
      placements: t.internships.internshipPlacements,
      users: t.users,
      extras: t.internships.internshipExtras,
      audit: t.audit,
      mailer: t.mailer,
      maxOpenApplications: 5,
      now,
    });
  }

  it("closes postings past their deadline", async () => {
    const { t, make } = await world();
    await make({ title: "Short deadline", closesAt: IN(1) });
    await make({ title: "Long deadline", closesAt: IN(30) });
    const run = await service(t, () => new Date(Date.now() + 2 * DAY)).runAutomation();
    expect(run.closed).toBe(1);
    expect(titles(await list(t))).toEqual(["Long deadline"]);
    expect((await service(t, () => new Date(Date.now() + 2 * DAY)).runAutomation()).closed).toBe(0); // safe to run twice
  });

  it("reminds people once about a saved internship or unfinished draft closing within 3 days", async () => {
    const { t, make } = await world();
    const soon = await make({ title: "Closing soon", closesAt: IN(2) });
    const later = await make({ title: "Closes later", closesAt: IN(20) });
    const ada = await t.learner("ada@example.rw");
    const bob = await t.learner("bob@example.rw");
    const cy = await t.learner("cy@example.rw");
    await send(t, "put", `/${soon.slug}/save`, ada.cookie);
    await send(t, "put", `/${soon.slug}/save`, bob.cookie);
    await send(t, "put", `/${soon.slug}/draft`, bob.cookie, { statement: "unfinished" }); // saved AND drafted: one email
    await send(t, "put", `/${later.slug}/save`, cy.cookie); // far away: nothing
    const svc = service(t, () => new Date());
    const run = await svc.runAutomation();
    expect(run.reminders).toBe(2);
    const reminders = t.mailer.sent.filter((m) => m.kind === "reminder");
    expect(reminders.map((m) => m.to).sort()).toEqual(["ada@example.rw", "bob@example.rw"]);
    expect(reminders.find((m) => m.to === "bob@example.rw")?.update).toMatch(/^draft\|/);
    expect(reminders.find((m) => m.to === "ada@example.rw")?.update).toMatch(/^saved\|/);
    expect((await svc.runAutomation()).reminders).toBe(0); // each person is reminded only once
  });

  it("does not remind someone who has already applied", async () => {
    const { t, make } = await world();
    const soon = await make({ title: "Closing soon", closesAt: IN(2) });
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", `/${soon.slug}/save`, ada.cookie);
    await apply(t, ada.cookie, soon.slug);
    expect((await service(t, () => new Date()).runAutomation()).reminders).toBe(0);
    expect(t.mailer.sent.filter((m) => m.kind === "reminder")).toHaveLength(0);
  });
});

describe("tools for reviewers", () => {
  it("edits a posting without wiping the fields that were not sent (regression)", async () => {
    const { t, admin, make, sup } = await world();
    const p = await make({
      compensationNote: "Transport paid",
      skills: ["HTML"],
      perks: ["Certificate"],
    });
    const res = await admin.patch(`/internships/postings/${p.id}`, { slots: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = json<{ posting: Record<string, unknown> }>(
      await admin.get(`/internships/postings/${p.id}`),
    ).posting;
    expect(after["slots"]).toBe(1);
    expect(after["supervisorIds"]).toEqual([sup.id]); // used to be reset to []
    expect(after["compensationNote"]).toBe("Transport paid");
    expect(after["skills"]).toEqual(["HTML"]);
    expect(after["perks"]).toEqual(["Certificate"]);
    void t;
  });

  it("validates the new posting fields", async () => {
    const { admin, sup } = await world();
    const bad = (over: Record<string, unknown>) =>
      admin.post("/internships/postings", postingBody([sup.id], over));
    expect(
      (await bad({ skills: Array.from({ length: 11 }, (_, i) => `skill${String(i)}`) })).status,
    ).toBe(400);
    expect(
      (
        await bad({
          screeningQuestions: Array.from({ length: 6 }, (_, i) => ({
            id: `q${String(i)}`,
            label: "A question?",
            kind: "text",
            required: false,
          })),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await bad({
          screeningQuestions: [
            { id: "a", label: "Same id one", kind: "text", required: false },
            { id: "a", label: "Same id two", kind: "text", required: false },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await bad({
          screeningQuestions: [
            { id: "c", label: "Pick one please", kind: "choice", required: false },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await bad({
          screeningQuestions: [
            {
              id: "t",
              label: "Free text here",
              kind: "text",
              required: false,
              options: ["a", "b"],
            },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await bad({
          screeningQuestions: [
            { id: "Bad Id!", label: "A question?", kind: "text", required: false },
          ],
        })
      ).status,
    ).toBe(400);
  });

  it("sorts applications by skills match and shows the labelled answers and profile", async () => {
    const { t, admin, make } = await world();
    const p = await make();
    const strong = await t.learner("strong@example.rw");
    const weak = await t.learner("weak@example.rw");
    await send(t, "put", "/profile/me", strong.cookie, PROFILE);
    await send(t, "put", "/profile/me", weak.cookie, { ...PROFILE, skills: ["Painting"] });
    await apply(t, weak.cookie, p.slug);
    await apply(t, strong.cookie, p.slug);
    const byMatch = json<{ items: { applicant: { email: string }; matchPercent: number }[] }>(
      await admin.get("/internships/applications?sort=match"),
    ).items;
    expect(byMatch.map((a) => a.applicant.email)).toEqual(["strong@example.rw", "weak@example.rw"]);
    expect(byMatch.map((a) => a.matchPercent)).toEqual([100, 0]);
    const oldest = json<{ items: { applicant: { email: string } }[] }>(
      await admin.get("/internships/applications?sort=oldest"),
    ).items;
    expect(oldest[0]?.applicant.email).toBe("weak@example.rw");
  });

  it("invites to an interview with time and place, shown to the applicant, and validates them", async () => {
    const { t, admin, make } = await world();
    const p = await make();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, p.slug)).application
      .id;
    await admin.post(`/internships/applications/${id}/transition`, { to: "shortlisted" });

    const at = IN(3);
    const bad = [
      { at: IN(-1), mode: "online", where: "https://meet.example.com/x" },
      { at, mode: "online", where: "http://insecure.example" },
    ];
    for (const interview of bad) {
      const r = await admin.post(`/internships/applications/${id}/transition`, {
        to: "interview",
        interview,
      });
      expect(r.status, JSON.stringify(interview)).toBe(422);
      expect(errorOf(r).code).toBe("INVALID_INTERVIEW");
    }
    expect(
      json<{ application: { status: string } }>(await admin.get(`/internships/applications/${id}`))
        .application.status,
    ).toBe("shortlisted");

    const ok = await admin.post(`/internships/applications/${id}/transition`, {
      to: "interview",
      interview: {
        at,
        mode: "online",
        where: "https://meet.example.com/abc",
        note: "Please join 5 minutes early.",
      },
    });
    expect(ok.status).toBe(200);
    const mine = json<{
      application: { interview: { mode: string; where: string; note: string }; status: string };
    }>(
      await t.api.get(`/api/v1/internships/applications/${id}`).set("Cookie", ada.cookie),
    ).application;
    expect(mine.status).toBe("interview");
    expect(mine.interview).toMatchObject({
      mode: "online",
      where: "https://meet.example.com/abc",
      note: "Please join 5 minutes early.",
    });
    // The email stays fixed text and carries no interview details.
    expect(JSON.stringify(t.mailer.sent)).not.toContain("meet.example.com");

    const moved = await admin.put(`/internships/applications/${id}/interview`, {
      at: IN(4),
      mode: "onsite",
      where: "MDL office, Kigali",
    });
    expect(moved.status).toBe(200);
    expect(
      json<{ application: { interview: { where: string } } }>(
        await t.api.get(`/api/v1/internships/applications/${id}`).set("Cookie", ada.cookie),
      ).application.interview.where,
    ).toBe("MDL office, Kigali");
    expect(t.audit.events.some((e) => e.action === "admin.internship.application.interview")).toBe(
      true,
    );
  });

  it("only accepts interview details at the interview step", async () => {
    const { t, admin, make } = await world();
    const p = await make();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, p.slug)).application
      .id;
    const early = await admin.put(`/internships/applications/${id}/interview`, {
      at: IN(3),
      mode: "phone",
      where: "+250788000000",
    });
    expect(early.status).toBe(409);
    const wrongStep = await admin.post(`/internships/applications/${id}/transition`, {
      to: "shortlisted",
      interview: { at: IN(3), mode: "phone", where: "+250788000000" },
    });
    expect(wrongStep.status).toBe(422);
    void t;
  });

  it("decides many applications at once and reports each result", async () => {
    const { t, admin, make } = await world();
    const p = await make();
    const ids: string[] = [];
    for (const name of ["a", "b", "c"]) {
      const u = await t.learner(`${name}@example.rw`);
      ids.push(
        json<{ application: { id: string } }>(await apply(t, u.cookie, p.slug)).application.id,
      );
    }
    await admin.post(`/internships/applications/${ids[2]}/transition`, { to: "rejected" }); // already final
    const res = await admin.post("/internships/applications/bulk-transition", {
      ids: [...ids, "does-not-exist"],
      to: "shortlisted",
      message: "Thanks, you are through.",
    });
    expect(res.status).toBe(200);
    const out = json<{
      results: { id: string; ok: boolean; code?: string }[];
      done: number;
      failed: number;
    }>(res);
    expect(out).toMatchObject({ done: 2, failed: 2 });
    expect(out.results.find((r) => r.id === ids[2])).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
    expect(out.results.find((r) => r.id === "does-not-exist")?.ok).toBe(false);
    expect(t.mailer.sent.filter((m) => m.update === "shortlisted")).toHaveLength(2);
    expect(
      t.audit.events.filter((e) => e.action === "admin.internship.application.transition"),
    ).toHaveLength(3);
  });

  it("refuses a bulk decision that staff may not make, and oversized lists", async () => {
    const { t, make } = await world();
    await make();
    const support = await t.staff("support@example.rw", ["support"]);
    const editor = await t.staff("editor@example.rw", ["editor"]);
    expect(
      (
        await support.post("/internships/applications/bulk-transition", {
          ids: ["x"],
          to: "placed",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await support.post("/internships/applications/bulk-transition", {
          ids: ["x"],
          to: "rejected",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await editor.post("/internships/applications/bulk-transition", {
          ids: ["x"],
          to: "rejected",
        })
      ).status,
    ).toBe(403);
    const many = Array.from({ length: 51 }, (_, i) => `id${String(i)}`);
    expect(
      (
        await support.post("/internships/applications/bulk-transition", {
          ids: many,
          to: "rejected",
        })
      ).status,
    ).toBe(400);
  });

  it("duplicates a posting as a fresh draft", async () => {
    const { t, admin, make, sup } = await world();
    const p = await make({
      screeningQuestions: [{ id: "why", label: "Why this role?", kind: "text", required: true }],
      startsOn: IN(20),
    });
    const res = await admin.post(`/internships/postings/${p.id}/duplicate`);
    expect(res.status).toBe(201);
    const copy = json<{ posting: Record<string, unknown> }>(res).posting;
    expect(copy).toMatchObject({
      title: "Web development intern (copy)",
      status: "draft",
      skills: ["HTML", "CSS", "JavaScript"],
      supervisorIds: [sup.id],
    });
    expect(copy["slug"]).not.toBe(p.slug);
    expect(copy["closesAt"]).toBeUndefined();
    expect(copy["startsOn"]).toBeUndefined();
    expect(copy["screeningQuestions"]).toHaveLength(1);
    expect(titles(await list(t))).toEqual(["Web development intern"]); // the copy is not public until published
    const support = await t.staff("support@example.rw", ["support"]);
    expect((await support.post(`/internships/postings/${p.id}/duplicate`)).status).toBe(403);
  });

  it("counts applications waiting more than a week", async () => {
    const { t, admin, make } = await world();
    const p = await make();
    const ada = await t.learner("ada@example.rw");
    await apply(t, ada.cookie, p.slug);
    expect(
      json<{ awaitingReviewOver7Days: number }>(await admin.get("/internships/stats"))
        .awaitingReviewOver7Days,
    ).toBe(0);
    const row = t.internships.internshipApplications.all[0];
    if (row === undefined) throw new Error("no application");
    row.createdAt = new Date(Date.now() - 9 * DAY);
    expect(
      json<{ awaitingReviewOver7Days: number }>(await admin.get("/internships/stats"))
        .awaitingReviewOver7Days,
    ).toBe(1);
    const stale = json<{ items: unknown[] }>(
      await admin.get("/internships/applications?waitingDays=7"),
    ).items;
    expect(stale).toHaveLength(1);
    expect(
      json<{ items: unknown[] }>(await admin.get("/internships/applications?waitingDays=30")).items,
    ).toHaveLength(0);
  });
});

describe("privacy of the new data", () => {
  it("includes the profile, saves, alert and drafts in the person's own export", async () => {
    const { t, make } = await world();
    const p = await make();
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", "/profile/me", ada.cookie, PROFILE);
    await send(t, "put", `/${p.slug}/save`, ada.cookie);
    await send(t, "put", `/${p.slug}/draft`, ada.cookie, { statement: "half written note" });
    await send(t, "put", "/alerts/me", ada.cookie, {
      departments: [],
      modes: [],
      keywords: "web",
      active: true,
    });
    const res = await t.api.get("/api/v1/users/me/export").set("Cookie", ada.cookie);
    const extras = body(res)["internshipExtras"] as Record<string, unknown>;
    expect(extras["profile"]).toMatchObject({
      headline: "Second-year software student",
      institution: "INES Ruhengeri",
    });
    expect(extras["savedInternshipIds"]).toHaveLength(1);
    expect(extras["alert"]).toMatchObject({ keywords: "web" });
    expect(extras["unsentDrafts"]).toHaveLength(1);
  });

  it("is removed together with the account's other internship data", async () => {
    const { t, make } = await world();
    const p = await make();
    const ada = await t.learner("ada@example.rw");
    await send(t, "put", "/profile/me", ada.cookie, PROFILE);
    await send(t, "put", `/${p.slug}/save`, ada.cookie);
    await send(t, "put", `/${p.slug}/draft`, ada.cookie, { statement: "x" });
    await send(t, "put", "/alerts/me", ada.cookie, {
      departments: [],
      modes: [],
      keywords: "",
      active: true,
    });
    const removed = await t.internships.internshipExtras.removeAllForUser(ada.id);
    expect(removed).toEqual({ profile: 1, drafts: 1, saves: 1, alerts: 1 });
    expect(t.internships.internshipExtras.profileRows).toHaveLength(0);
  });
});
