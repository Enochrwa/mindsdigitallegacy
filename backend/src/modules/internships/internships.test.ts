import { describe, expect, it } from "vitest";
import { errorOf } from "../../testing/fixtures.js";
import { CSRF, harness } from "../../testing/harness.js";
import { AGREEMENT_VERSION } from "./internships.types.js";

type H = ReturnType<typeof harness>;
const json = <T>(res: { body: unknown }): T => res.body as T;
const IN_30_DAYS = new Date(Date.now() + 30 * 86_400_000).toISOString();
const START = "2027-02-01";
const END = "2027-04-01";

const STATEMENT =
  "I am a second-year student who has built two small web apps and I want supervised real-world practice.";

function postingBody(supervisorIds: string[], over: Record<string, unknown> = {}) {
  return {
    title: "Web development intern",
    department: "software_web",
    summary: "Build real features with our engineers.",
    description:
      "Work on the MDL platform with a supervisor, learn code review and testing in a team.",
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
    supervisorIds,
    closesAt: IN_30_DAYS,
    ...over,
  };
}

/** One admin, one supervisor, one published posting, ready for applicants. */
async function setup(over: Record<string, unknown> = {}, supervisorCount = 1) {
  const t = harness();
  const admin = await t.staff("admin@example.rw");
  const supervisors: { email: string; id: string; cookie: string }[] = [];
  for (let i = 0; i < supervisorCount; i += 1) {
    const email = `sup${String(i)}@example.rw`;
    const s = await t.learner(email);
    t.setRoles(email, ["supervisor"]);
    supervisors.push(s);
  }
  const created = await admin.post(
    "/internships/postings",
    postingBody(
      supervisors.map((s) => s.id),
      over,
    ),
  );
  expect(created.status).toBe(201);
  const posting = json<{ posting: { id: string; slug: string } }>(created).posting;
  const published = await admin.post(`/internships/postings/${posting.id}/publish`);
  expect(published.status).toBe(200);
  return { t, admin, supervisors, posting };
}

const apply = (
  t: H,
  cookie: string,
  slug: string,
  over: Record<string, unknown> = {},
  headers: Record<string, string> = CSRF,
) =>
  t.api
    .post(`/api/v1/internships/${slug}/apply`)
    .set(headers)
    .set("Cookie", cookie)
    .send({
      statement: STATEMENT,
      links: ["https://github.com/ada"],
      under18: false,
      consent: true,
      privacyNoticeVersion: "2026-11",
      ...over,
    });

const mine = (t: H, cookie: string, path: string) =>
  t.api.get(`/api/v1/internships${path}`).set("Cookie", cookie);
const post = (t: H, cookie: string, path: string, body: object = {}) =>
  t.api.post(`/api/v1/internships${path}`).set(CSRF).set("Cookie", cookie).send(body);

/** Moves an application through staff steps up to an accepted offer. */
async function toAccepted(
  t: H,
  admin: Awaited<ReturnType<H["staff"]>>,
  cookie: string,
  applicationId: string,
) {
  for (const to of ["shortlisted", "interview", "offered"]) {
    const res = await admin.post(`/internships/applications/${applicationId}/transition`, { to });
    expect(res.status, `to ${to}`).toBe(200);
  }
  const accepted = await post(t, cookie, `/applications/${applicationId}/accept`, {
    agreementVersion: AGREEMENT_VERSION,
  });
  expect(accepted.status).toBe(200);
}

describe("public postings", () => {
  it("lists only published, open postings and never exposes supervisors or staff ids", async () => {
    const { t, admin, supervisors } = await setup();
    await admin.post(
      "/internships/postings",
      postingBody([supervisors[0]?.id ?? ""], { title: "Hidden draft role" }),
    );
    const res = await t.api.get("/api/v1/internships");
    expect(res.status).toBe(200);
    const items = json<{ items: { title: string }[] }>(res).items;
    expect(items.map((i) => i.title)).toEqual(["Web development intern"]);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(supervisors[0]?.id ?? "x");
    expect(text).not.toMatch(/supervisorIds|createdBy/);
    expect(text).toContain("does not guarantee");
  });

  it("shows one posting by slug, and 404 for drafts and unknown slugs", async () => {
    const { t, admin, supervisors, posting } = await setup();
    expect((await t.api.get(`/api/v1/internships/${posting.slug}`)).status).toBe(200);
    const draft = await admin.post(
      "/internships/postings",
      postingBody([supervisors[0]?.id ?? ""], { title: "Draft only role" }),
    );
    const draftSlug = json<{ posting: { slug: string } }>(draft).posting.slug;
    expect((await t.api.get(`/api/v1/internships/${draftSlug}`)).status).toBe(404);
    expect((await t.api.get("/api/v1/internships/nope-nope")).status).toBe(404);
  });

  it("does not let a posting take a reserved route name as its slug", async () => {
    const { admin, supervisors } = await setup();
    const res = await admin.post(
      "/internships/postings",
      postingBody([supervisors[0]?.id ?? ""], { title: "Applications" }),
    );
    expect(json<{ posting: { slug: string } }>(res).posting.slug).not.toBe("applications");
  });
});

describe("applying", () => {
  it("requires a signed-in session and the CSRF header", async () => {
    const { t, posting } = await setup();
    expect((await t.api.post(`/api/v1/internships/${posting.slug}/apply`).send({})).status).toBe(
      401,
    );
    const ada = await t.learner("ada@example.rw");
    const res = await apply(t, ada.cookie, posting.slug, {}, {});
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("CSRF_HEADER_REQUIRED");
  });

  it("is idempotent: a double submit returns the first application", async () => {
    const { t, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const first = await apply(t, ada.cookie, posting.slug);
    const second = await apply(t, ada.cookie, posting.slug, {
      statement: STATEMENT + " Edited later.",
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(json<{ application: { id: string } }>(second).application.id).toBe(
      json<{ application: { id: string } }>(first).application.id,
    );
    expect(t.internships.internshipApplications.all).toHaveLength(1);
    // The repeat did not overwrite what the first submission said.
    expect(t.internships.internshipApplications.all[0]?.statement).toBe(STATEMENT);
  });

  it("sends one fixed-text confirmation mail and audits the event", async () => {
    const { t, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    await apply(t, ada.cookie, posting.slug);
    expect(
      t.mailer.sent.filter((m) => m.kind === "internship" && m.update === "received"),
    ).toHaveLength(1);
    expect(t.audit.events.some((e) => e.action === "internship.apply")).toBe(true);
  });

  it("rejects unknown fields, short statements, missing consent and non-https links", async () => {
    const { t, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    expect((await apply(t, ada.cookie, posting.slug, { status: "offered" })).status).toBe(400);
    expect((await apply(t, ada.cookie, posting.slug, { statement: "too short" })).status).toBe(400);
    expect((await apply(t, ada.cookie, posting.slug, { consent: false })).status).toBe(400);
    expect(
      (await apply(t, ada.cookie, posting.slug, { links: ["http://insecure.example"] })).status,
    ).toBe(400);
    expect(
      (await apply(t, ada.cookie, posting.slug, { links: ["javascript:alert(1)"] })).status,
    ).toBe(400);
    expect(t.internships.internshipApplications.all).toHaveLength(0);
  });

  it("blocks unverified accounts and under-16 learners", async () => {
    const { t, posting } = await setup();
    await t.signUp("new@example.rw", {}, { verify: false });
    // Unverified accounts cannot sign in at all, so they cannot reach the endpoint.
    expect(
      (
        await t.api
          .post("/api/v1/auth/login")
          .send({ email: "new@example.rw", password: "correct horse battery" })
      ).status,
    ).not.toBe(200);
    const kid = await t.learner("kid@example.rw");
    const user = t.users.all.get(kid.id);
    if (user === undefined) throw new Error("no user");
    // A child whose guardian has consented: the account works, but internships are still closed to them.
    t.users.all.set(kid.id, {
      ...user,
      ageBracket: "under_16",
      guardian: { email: "parent@example.rw", consentAt: new Date() },
    });
    const res = await apply(t, kid.cookie, posting.slug);
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("TOO_YOUNG");
  });

  it("asks under-18 applicants for a guardian, and refuses one for adults", async () => {
    const { t, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const missing = await apply(t, ada.cookie, posting.slug, { under18: true });
    expect(errorOf(missing).code).toBe("GUARDIAN_REQUIRED");
    const extra = await apply(t, ada.cookie, posting.slug, {
      guardian: { name: "Jean", relationship: "father", contact: "0788000000" },
    });
    expect(errorOf(extra).code).toBe("GUARDIAN_NOT_ALLOWED");
    const ok = await apply(t, ada.cookie, posting.slug, {
      under18: true,
      guardian: { name: "Jean", relationship: "father", contact: "0788000000" },
    });
    expect(ok.status).toBe(201);
    expect(JSON.stringify(ok.body)).not.toContain("0788000000");
  });

  it("refuses closed postings", async () => {
    const { t, admin, posting } = await setup();
    await admin.post(`/internships/postings/${posting.id}/close`);
    const ada = await t.learner("ada@example.rw");
    expect(errorOf(await apply(t, ada.cookie, posting.slug)).code).toMatch(
      /NOT_FOUND|POSTING_CLOSED/,
    );
  });
});

describe("applicant privacy", () => {
  it("never shows reviewer notes, scores or staff ids to the applicant", async () => {
    const { t, admin, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    await admin.post(`/internships/applications/${id}/notes`, {
      text: "SECRETOPINION weak on testing",
      score: 2,
    });
    await admin.post(`/internships/applications/${id}/transition`, {
      to: "shortlisted",
      note: "SECRETNOTE2",
      message: "Thanks, we will be in touch.",
    });
    const list = JSON.stringify((await mine(t, ada.cookie, "/applications/me")).body);
    const one = JSON.stringify((await mine(t, ada.cookie, `/applications/${id}`)).body);
    for (const body of [list, one]) {
      expect(body).not.toMatch(/SECRETOPINION|SECRETNOTE2|score|notes|"by"/);
      expect(body).toContain("Thanks, we will be in touch.");
    }
    // Staff do see the notes.
    const staffView = JSON.stringify((await admin.get(`/internships/applications/${id}`)).body);
    expect(staffView).toContain("SECRETOPINION");
  });

  it("returns 404 for someone else's application, for every action", async () => {
    const { t, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const eve = await t.learner("eve@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    expect((await mine(t, eve.cookie, `/applications/${id}`)).status).toBe(404);
    expect((await post(t, eve.cookie, `/applications/${id}/withdraw`)).status).toBe(404);
    expect(
      (
        await post(t, eve.cookie, `/applications/${id}/accept`, {
          agreementVersion: AGREEMENT_VERSION,
        })
      ).status,
    ).toBe(404);
    expect(
      json<{ items: unknown[] }>(await mine(t, eve.cookie, "/applications/me")).items,
    ).toHaveLength(0);
  });

  it("lets an applicant withdraw, once", async () => {
    const { t, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    const first = await post(t, ada.cookie, `/applications/${id}/withdraw`);
    expect(first.status).toBe(200);
    expect(json<{ application: { status: string } }>(first).application.status).toBe("withdrawn");
    expect((await post(t, ada.cookie, `/applications/${id}/withdraw`)).status).toBe(409);
  });
});

describe("staff review", () => {
  it("enforces the state machine and rejects skipped or invalid steps", async () => {
    const { t, admin, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    const skip = await admin.post(`/internships/applications/${id}/transition`, { to: "offered" });
    expect(errorOf(skip).code).toBe("INVALID_TRANSITION");
    expect(
      (await admin.post(`/internships/applications/${id}/transition`, { to: "placed" })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/internships/applications/${id}/transition`, { to: "accepted" })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/internships/applications/${id}/transition`, { to: "shortlisted" }))
        .status,
    ).toBe(200);
    // The same move twice is refused, not repeated.
    expect(
      (await admin.post(`/internships/applications/${id}/transition`, { to: "shortlisted" }))
        .status,
    ).toBe(409);
  });

  it("emails the applicant fixed text only, never the reviewer's words", async () => {
    const { t, admin, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    await admin.post(`/internships/applications/${id}/transition`, {
      to: "rejected",
      note: "PRIVATE OPINION",
      message: "Not this time.",
    });
    const sent = t.mailer.sent.filter((m) => m.kind === "internship").map((m) => m.update);
    expect(sent).toEqual(["received", "rejected"]);
    expect(JSON.stringify(t.mailer.sent)).not.toMatch(/PRIVATE OPINION|Not this time/);
  });

  it("applies each permission: support can review but not place; editors see nothing", async () => {
    const { t, admin, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    const support = await t.staff("support@example.rw", ["support"]);
    expect((await support.get("/internships/applications")).status).toBe(200);
    expect(
      (await support.post(`/internships/applications/${id}/transition`, { to: "shortlisted" }))
        .status,
    ).toBe(200);
    expect(
      (
        await support.post(`/internships/applications/${id}/place`, {
          supervisorId: "x",
          startsOn: START,
          endsOn: END,
        })
      ).status,
    ).toBe(403);
    expect((await support.post("/internships/postings", postingBody([]))).status).toBe(403);
    const editor = await t.staff("editor@example.rw", ["editor"]);
    expect((await editor.get("/internships/applications")).status).toBe(403);
    // A learner has no staff access at all.
    expect(
      (await t.api.get("/api/v1/admin/internships/applications").set("Cookie", ada.cookie)).status,
    ).toBe(403);
    void admin;
  });

  it("requires the second factor for the internship console", async () => {
    const { t } = await setup();
    const noMfa = await t.staff("nomfa@example.rw", ["admin"], { mfa: false });
    expect((await noMfa.get("/internships/applications")).status).toBe(403);
  });

  it("audits every staff action", async () => {
    const { t, admin, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    await admin.post(`/internships/applications/${id}/notes`, { text: "Good portfolio", score: 4 });
    await admin.post(`/internships/applications/${id}/transition`, { to: "shortlisted" });
    const actions = t.audit.events.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "admin.internship.posting.create",
        "admin.internship.posting.publish",
        "admin.internship.application.note",
        "admin.internship.application.transition",
      ]),
    );
    expect(JSON.stringify(t.audit.events)).not.toContain("Good portfolio");
  });
});

describe("postings and capacity", () => {
  it("cannot publish without a supervisor or beyond supervisor capacity", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const sup = await t.learner("sup@example.rw");
    t.setRoles("sup@example.rw", ["supervisor"]);
    const none = await admin.post("/internships/postings", postingBody([]));
    const noneId = json<{ posting: { id: string } }>(none).posting.id;
    expect(errorOf(await admin.post(`/internships/postings/${noneId}/publish`)).code).toBe(
      "NO_SUPERVISOR",
    );
    // One supervisor may guide 3 interns (default), so 4 slots is over capacity.
    const big = await admin.post(
      "/internships/postings",
      postingBody([sup.id], { title: "Too many slots", slots: 4 }),
    );
    const bigId = json<{ posting: { id: string } }>(big).posting.id;
    expect(errorOf(await admin.post(`/internships/postings/${bigId}/publish`)).code).toBe(
      "OVER_CAPACITY",
    );
  });

  it("only accepts real supervisors on a posting", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const ada = await t.learner("ada@example.rw");
    const res = await admin.post("/internships/postings", postingBody([ada.id]));
    expect(errorOf(res).code).toBe("INVALID_SUPERVISOR");
  });

  it("validates input strictly", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    expect(
      (await admin.post("/internships/postings", { ...postingBody([]), role: "admin" })).status,
    ).toBe(400);
    expect(
      (await admin.post("/internships/postings", postingBody([], { durationWeeks: 1 }))).status,
    ).toBe(400);
    expect(
      (await admin.post("/internships/postings", postingBody([], { minAge: 14 }))).status,
    ).toBe(400);
    expect(
      (
        await admin.post(
          "/internships/postings",
          postingBody([], { opensAt: IN_30_DAYS, closesAt: new Date().toISOString() }),
        )
      ).status,
    ).toBe(400);
  });
});

describe("offer, agreement and placement", () => {
  it("runs the whole pipeline and grants then removes the intern role", async () => {
    const { t, admin, supervisors, posting } = await setup();
    const sup = supervisors[0];
    if (sup === undefined) throw new Error("no supervisor");
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    await toAccepted(t, admin, ada.cookie, id);

    const placed = await admin.post(`/internships/applications/${id}/place`, {
      supervisorId: sup.id,
      startsOn: START,
      endsOn: END,
    });
    expect(placed.status).toBe(201);
    const placementId = json<{ placement: { id: string } }>(placed).placement.id;
    expect(t.users.all.get(ada.id)?.roles).toContain("intern");
    expect(t.internships.internshipApplications.all[0]?.status).toBe("placed");

    // The intern sees their placement, their supervisor's name, and only feedback shared with them.
    await t.api
      .post(`/api/v1/supervisor/placements/${placementId}/feedback`)
      .set(CSRF)
      .set("Cookie", sup.cookie)
      .send({ text: "Great first week, keep it up.", rating: 5 });
    await t.api
      .post(`/api/v1/supervisor/placements/${placementId}/feedback`)
      .set(CSRF)
      .set("Cookie", sup.cookie)
      .send({ text: "PRIVATE staff-only remark here", visibleToIntern: false });
    const view = await mine(t, ada.cookie, "/placements/me");
    const text = JSON.stringify(view.body);
    expect(text).toContain("Great first week");
    expect(text).not.toContain("PRIVATE staff-only");
    expect(text).not.toContain(sup.email);

    const ended = await admin.post(`/internships/placements/${placementId}/end`, {
      status: "completed",
      summary: "Delivered a feature.",
    });
    expect(ended.status).toBe(200);
    expect(t.users.all.get(ada.id)?.roles).not.toContain("intern");
    expect(
      errorOf(
        await admin.post(`/internships/placements/${placementId}/end`, { status: "completed" }),
      ).code,
    ).toBe("ALREADY_ENDED");
    expect(t.mailer.sent.filter((m) => m.update === "placed")).toHaveLength(1);
  });

  it("will not accept an offer with an outdated agreement, or when there is no offer", async () => {
    const { t, admin, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    expect(
      errorOf(
        await post(t, ada.cookie, `/applications/${id}/accept`, {
          agreementVersion: AGREEMENT_VERSION,
        }),
      ).code,
    ).toBe("NOT_OFFERED");
    for (const to of ["shortlisted", "offered"])
      await admin.post(`/internships/applications/${id}/transition`, { to });
    expect(
      errorOf(await post(t, ada.cookie, `/applications/${id}/accept`, { agreementVersion: "old" }))
        .code,
    ).toBe("AGREEMENT_CHANGED");
  });

  it("refuses placement without acceptance, without a supervisor on the posting, or when full", async () => {
    const { t, admin, supervisors, posting } = await setup({ slots: 1 }, 2);
    const [s1, s2] = supervisors;
    if (s1 === undefined || s2 === undefined) throw new Error("need supervisors");
    const ada = await t.learner("ada@example.rw");
    const bob = await t.learner("bob@example.rw");
    const adaId = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    const bobId = json<{ application: { id: string } }>(await apply(t, bob.cookie, posting.slug))
      .application.id;

    const early = await admin.post(`/internships/applications/${adaId}/place`, {
      supervisorId: s1.id,
      startsOn: START,
      endsOn: END,
    });
    expect(errorOf(early).code).toBe("NOT_ACCEPTED");

    await toAccepted(t, admin, ada.cookie, adaId);
    await toAccepted(t, admin, bob.cookie, bobId);
    const outsider = await t.learner("out@example.rw");
    t.setRoles("out@example.rw", ["supervisor"]);
    expect(
      errorOf(
        await admin.post(`/internships/applications/${adaId}/place`, {
          supervisorId: outsider.id,
          startsOn: START,
          endsOn: END,
        }),
      ).code,
    ).toBe("SUPERVISOR_NOT_ON_POSTING");
    expect(
      errorOf(
        await admin.post(`/internships/applications/${adaId}/place`, {
          supervisorId: s1.id,
          startsOn: END,
          endsOn: START,
        }),
      ).code,
    ).toBe("BAD_DATES");

    expect(
      (
        await admin.post(`/internships/applications/${adaId}/place`, {
          supervisorId: s1.id,
          startsOn: START,
          endsOn: END,
        })
      ).status,
    ).toBe(201);
    // One slot only: the second person cannot be placed.
    expect(
      errorOf(
        await admin.post(`/internships/applications/${bobId}/place`, {
          supervisorId: s2.id,
          startsOn: START,
          endsOn: END,
        }),
      ).code,
    ).toBe("NO_SLOTS");
  });

  it("limits how many interns one supervisor guides at once", async () => {
    const { t, admin, supervisors, posting } = await setup({ slots: 3 });
    const sup = supervisors[0];
    if (sup === undefined) throw new Error("no supervisor");
    const results: number[] = [];
    // Raise the posting to 3 slots (allowed: 1 supervisor x 3) then try to place a 4th via a second posting.
    for (const name of ["a", "b", "c"]) {
      const u = await t.learner(`${name}@example.rw`);
      const id = json<{ application: { id: string } }>(await apply(t, u.cookie, posting.slug))
        .application.id;
      await toAccepted(t, admin, u.cookie, id);
      results.push(
        (
          await admin.post(`/internships/applications/${id}/place`, {
            supervisorId: sup.id,
            startsOn: START,
            endsOn: END,
          })
        ).status,
      );
    }
    expect(results).toEqual([201, 201, 201]);
    const second = await admin.post(
      "/internships/postings",
      postingBody([sup.id], { title: "Second role", slots: 1 }),
    );
    const secondPosting = json<{ posting: { id: string; slug: string } }>(second).posting;
    await admin.post(`/internships/postings/${secondPosting.id}/publish`);
    const d = await t.learner("d@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, d.cookie, secondPosting.slug))
      .application.id;
    await toAccepted(t, admin, d.cookie, id);
    expect(
      errorOf(
        await admin.post(`/internships/applications/${id}/place`, {
          supervisorId: sup.id,
          startsOn: START,
          endsOn: END,
        }),
      ).code,
    ).toBe("SUPERVISOR_FULL");
  });

  it("will not place an under-18 until a staff member verifies the guardian", async () => {
    const { t, admin, supervisors, posting } = await setup();
    const sup = supervisors[0];
    if (sup === undefined) throw new Error("no supervisor");
    const teen = await t.learner("teen@example.rw");
    const id = json<{ application: { id: string } }>(
      await apply(t, teen.cookie, posting.slug, {
        under18: true,
        guardian: { name: "Jean", relationship: "father", contact: "0788000000" },
      }),
    ).application.id;
    await toAccepted(t, admin, teen.cookie, id);
    const blocked = await admin.post(`/internships/applications/${id}/place`, {
      supervisorId: sup.id,
      startsOn: START,
      endsOn: END,
    });
    expect(errorOf(blocked).code).toBe("GUARDIAN_NOT_VERIFIED");
    expect((await admin.post(`/internships/applications/${id}/verify-guardian`)).status).toBe(200);
    expect(
      (
        await admin.post(`/internships/applications/${id}/place`, {
          supervisorId: sup.id,
          startsOn: START,
          endsOn: END,
        })
      ).status,
    ).toBe(201);
  });

  it("cannot place the same application twice, even at the same moment", async () => {
    const { t, admin, supervisors, posting } = await setup();
    const sup = supervisors[0];
    if (sup === undefined) throw new Error("no supervisor");
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    await toAccepted(t, admin, ada.cookie, id);
    const both = await Promise.all([
      admin.post(`/internships/applications/${id}/place`, {
        supervisorId: sup.id,
        startsOn: START,
        endsOn: END,
      }),
      admin.post(`/internships/applications/${id}/place`, {
        supervisorId: sup.id,
        startsOn: START,
        endsOn: END,
      }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(t.internships.internshipPlacements.all).toHaveLength(1);
  });

  it("lets staff reassign a supervisor, within the posting and capacity rules", async () => {
    const { t, admin, supervisors, posting } = await setup({}, 2);
    const [s1, s2] = supervisors;
    if (s1 === undefined || s2 === undefined) throw new Error("need supervisors");
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    await toAccepted(t, admin, ada.cookie, id);
    const placed = await admin.post(`/internships/applications/${id}/place`, {
      supervisorId: s1.id,
      startsOn: START,
      endsOn: END,
    });
    const placementId = json<{ placement: { id: string } }>(placed).placement.id;
    const moved = await admin.post(`/internships/placements/${placementId}/supervisor`, {
      supervisorId: s2.id,
    });
    expect(moved.status).toBe(200);
    const stranger = await t.learner("x@example.rw");
    t.setRoles("x@example.rw", ["supervisor"]);
    expect(
      errorOf(
        await admin.post(`/internships/placements/${placementId}/supervisor`, {
          supervisorId: stranger.id,
        }),
      ).code,
    ).toBe("SUPERVISOR_NOT_ON_POSTING");
  });
});

describe("supervisor access", () => {
  it("shows a supervisor only their own placements and lets them write feedback only on those", async () => {
    const { t, admin, supervisors, posting } = await setup({}, 2);
    const [s1, s2] = supervisors;
    if (s1 === undefined || s2 === undefined) throw new Error("need supervisors");
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    await toAccepted(t, admin, ada.cookie, id);
    const placed = await admin.post(`/internships/applications/${id}/place`, {
      supervisorId: s1.id,
      startsOn: START,
      endsOn: END,
    });
    const placementId = json<{ placement: { id: string } }>(placed).placement.id;

    const own = await t.api.get("/api/v1/supervisor/placements").set("Cookie", s1.cookie);
    expect(json<{ items: unknown[] }>(own).items).toHaveLength(1);
    const other = await t.api.get("/api/v1/supervisor/placements").set("Cookie", s2.cookie);
    expect(json<{ items: unknown[] }>(other).items).toHaveLength(0);
    const sneaky = await t.api
      .post(`/api/v1/supervisor/placements/${placementId}/feedback`)
      .set(CSRF)
      .set("Cookie", s2.cookie)
      .send({ text: "I should not be able to write this." });
    expect(sneaky.status).toBe(404);
    // A learner without the role is refused outright, and a supervisor cannot reach the staff console.
    expect(
      (await t.api.get("/api/v1/supervisor/placements").set("Cookie", ada.cookie)).status,
    ).toBe(403);
    expect(
      (await t.api.get("/api/v1/admin/internships/applications").set("Cookie", s1.cookie)).status,
    ).toBe(403);
  });
});

describe("overview and export", () => {
  it("reports counts and supervisor load", async () => {
    const { t, admin, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    await apply(t, ada.cookie, posting.slug);
    const stats = await admin.get("/internships/stats");
    expect(stats.status).toBe(200);
    const body = json<{
      totalApplications: number;
      supervisors: { active: number; capacity: number }[];
      postings: { published: number };
    }>(stats);
    expect(body.totalApplications).toBe(1);
    expect(body.postings.published).toBe(1);
    expect(body.supervisors[0]).toMatchObject({ active: 0, capacity: 3 });
  });

  it("exports applications as CSV, neutralising spreadsheet formulas, and audits it", async () => {
    const { t, admin, posting } = await setup();
    const evil = await t.learner("evil@example.rw", { displayName: '=HYPERLINK("http://x")' });
    await apply(t, evil.cookie, posting.slug);
    const res = await admin.get("/internships/applications/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("'=HYPERLINK");
    expect(res.text).not.toMatch(/(^|,)=HYPERLINK/);
    expect(t.audit.events.some((e) => e.action === "admin.export")).toBe(true);
    const support = await t.staff("support@example.rw", ["support"]);
    expect((await support.get("/internships/applications/export.csv")).status).toBe(403);
  });

  it("adds the person's own internship data, without notes, to their export", async () => {
    const { t, admin, posting } = await setup();
    const ada = await t.learner("ada@example.rw");
    const id = json<{ application: { id: string } }>(await apply(t, ada.cookie, posting.slug))
      .application.id;
    await admin.post(`/internships/applications/${id}/notes`, { text: "STAFFONLYNOTE", score: 3 });
    const res = await t.api.get("/api/v1/users/me/export").set("Cookie", ada.cookie);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).toContain("Web development intern");
    expect(text).not.toContain("STAFFONLYNOTE");
  });
});
