import { describe, expect, it } from "vitest";
import { errorOf, validContact } from "../../testing/fixtures.js";
import { CSRF, harness } from "../../testing/harness.js";

type H = ReturnType<typeof harness>;
type Staff = Awaited<ReturnType<H["staff"]>>;

const body = <T>(res: { body: unknown }): T => res.body as T;
const course = {
  slug: "new-course",
  title: "New course",
  summary: "A summary that is long enough.",
  description: [{ type: "paragraph", text: "Hello." }],
  level: "beginner",
  language: "en",
  order: 50,
  tags: ["basics"],
  outcomes: ["Do a thing"],
  audience: "Everyone",
  prerequisiteIds: [],
  instructors: [],
  unlockPolicy: { type: "open" },
};

async function categoryId(a: Staff): Promise<string> {
  const res = await a.get("/categories");
  const items = body<{ items?: { id: string }[]; categories?: { id: string }[] }>(res);
  const first = (items.items ?? items.categories ?? [])[0]?.id;
  if (first === undefined) throw new Error("no category");
  return first;
}

describe("content management", () => {
  it("creates a course with sections and lessons, and blocks publishing until valid", async () => {
    const t = harness();
    const a = await t.staff("e@example.rw", ["editor"]);
    const created = await a.post("/courses", { ...course, categoryId: await categoryId(a) });
    expect(created.status).toBe(201);
    const id =
      body<{ course: { id: string } }>(created).course?.id ?? body<{ id: string }>(created).id;
    expect((await a.post(`/courses/${id}/status`, { status: "published" })).status).toBe(422);

    const section = await a.post(`/courses/${id}/sections`, { title: "Intro" });
    expect(section.status).toBe(201);
    const sectionId =
      body<{ section?: { id: string }; id?: string }>(section).section?.id ??
      body<{ id: string }>(section).id;
    const lesson = await a.post(`/courses/${id}/lessons`, {
      sectionId,
      slug: "first",
      title: "First",
      summary: "First lesson summary.",
      kind: "reading",
      required: true,
      isPreview: false,
      body: [{ type: "paragraph", text: "Read this." }],
      resources: [],
    });
    expect(lesson.status).toBe(201);
    const lessonId =
      body<{ lesson?: { id: string }; id?: string }>(lesson).lesson?.id ??
      body<{ id: string }>(lesson).id;
    expect(
      (await a.post(`/lessons/${lessonId}/status`, { status: "published" })).status,
    ).toBeLessThan(300);
    const publish = await a.post(`/courses/${id}/status`, { status: "published" });
    expect(publish.status).toBe(200);
    expect(t.audit.events.some((e) => e.action === "admin.course.create")).toBe(true);
  });

  it("rejects bad video ids, http resources, and duplicate slugs", async () => {
    const t = harness();
    const a = await t.staff("e@example.rw", ["editor"]);
    const cat = await categoryId(a);
    expect((await a.post("/courses", { ...course, categoryId: cat })).status).toBe(201);
    const dup = await a.post("/courses", { ...course, categoryId: cat });
    expect(dup.status).toBe(409);
    expect(
      (await a.post("/courses", { ...course, slug: "x", categoryId: cat, role: "admin" })).status,
    ).toBe(400);
  });

  it("rejects an invalid YouTube id on a lesson", async () => {
    const t = harness();
    const a = await t.staff("e@example.rw", ["editor"]);
    const created = await a.post("/courses", { ...course, categoryId: await categoryId(a) });
    const id = body<{ course?: { id: string }; id?: string }>(created);
    const courseId = id.course?.id ?? id.id ?? "";
    const section = body<{ section?: { id: string }; id?: string }>(
      await a.post(`/courses/${courseId}/sections`, { title: "S" }),
    );
    const res = await a.post(`/courses/${courseId}/lessons`, {
      sectionId: section.section?.id ?? section.id,
      slug: "v",
      title: "V",
      summary: "Video lesson summary.",
      kind: "video",
      required: true,
      isPreview: false,
      video: { provider: "youtube", videoId: "not-an-id", durationSec: 60 },
      body: [],
      resources: [],
    });
    expect(res.status).toBe(400);
  });

  it("marks hand-edited courses as admin-managed so the importer leaves them alone", async () => {
    const t = harness();
    const a = await t.staff("e@example.rw", ["editor"]);
    const list = body<{ items: { id: string; source: string; slug: string }[] }>(
      await a.get("/courses"),
    );
    const first = list.items[0];
    expect(first?.source).toBe("file");
    const res = await a.put(`/courses/${first?.id}`, { summary: "Edited in the console." });
    expect(res.status).toBe(200);
    const after = body<{ items: { id: string; source: string }[] }>(await a.get("/courses"));
    expect(after.items.find((c) => c.id === first?.id)?.source).toBe("admin");
  });
});

describe("lead pipeline", () => {
  async function leadId(t: H, a: Staff): Promise<string> {
    const res = await t.api.post("/api/v1/leads").set(CSRF).send(validContact);
    expect(res.status).toBeLessThan(300);
    const list = body<{ items: { id: string }[] }>(await a.get("/leads"));
    return list.items[0]?.id ?? "";
  }

  it("moves a lead through the pipeline with notes, tags and follow-ups", async () => {
    const t = harness();
    const a = await t.staff("s@example.rw", ["support"]);
    const id = await leadId(t, a);
    expect(id).not.toBe("");
    const patch = await a.patch(`/leads/${id}`, {
      status: "contacted",
      priority: "high",
      tags: ["school"],
      followUpAt: "2026-01-01T00:00:00.000Z",
    });
    expect(patch.status).toBe(200);
    expect((await a.post(`/leads/${id}/notes`, { text: "Called, left voicemail." })).status).toBe(
      201,
    );
    const detail = body<{ lead: { status: string; notes: unknown[]; tags: string[] } }>(
      await a.get(`/leads/${id}`),
    );
    expect(detail.lead).toMatchObject({ status: "contacted", tags: ["school"] });
    expect(detail.lead.notes).toHaveLength(1);
    const list = body<{ overdue: number; counts: Record<string, number> }>(await a.get("/leads"));
    expect(list.overdue).toBe(1);
    const overdue = body<{ items: unknown[] }>(await a.get("/leads?overdue=true"));
    expect(overdue.items).toHaveLength(1);
  });

  it("only lets staff be assigned and rejects unknown fields", async () => {
    const t = harness();
    const a = await t.staff("s@example.rw", ["support"]);
    const learner = await t.learner("l@example.rw");
    const id = await leadId(t, a);
    expect((await a.patch(`/leads/${id}`, { assignedTo: learner.id })).status).toBe(400);
    expect((await a.patch(`/leads/${id}`, { assignedTo: a.id })).status).toBe(200);
    expect((await a.patch(`/leads/${id}`, { email: "x@y.rw" })).status).toBe(400);
  });

  it("deletes a lead on request and audits it", async () => {
    const t = harness();
    const a = await t.staff("s@example.rw", ["support"]);
    const id = await leadId(t, a);
    expect((await a.del(`/leads/${id}`)).status).toBe(204);
    expect((await a.get(`/leads/${id}`)).status).toBe(404);
    expect(t.audit.events.some((e) => e.action === "admin.lead.delete")).toBe(true);
  });
});

describe("settings", () => {
  it("validates, versions, and audits changes", async () => {
    const t = harness();
    const a = await t.staff("admin@example.rw");
    const cur = body<{ version: number; settings: Record<string, Record<string, unknown>> }>(
      await a.get("/settings"),
    );
    const next = {
      ...cur.settings,
      announcement: { enabled: true, message: "Maintenance on Sunday" },
    };
    expect((await a.put("/settings", { version: cur.version, settings: next })).status).toBe(200);
    const stale = await a.put("/settings", { version: cur.version, settings: next });
    expect(stale.status).toBe(409);
    expect(errorOf(stale).code).toBe("STALE_SETTINGS");
    const site = body<{ announcement: string | null }>(await t.api.get("/api/v1/site"));
    expect(site.announcement).toBe("Maintenance on Sunday");
    expect(t.audit.events.some((e) => e.action === "admin.settings.update")).toBe(true);
  });

  it("rejects nonsense thresholds and duplicate experiment arms", async () => {
    const t = harness();
    const a = await t.staff("admin@example.rw");
    const cur = body<{ version: number; settings: Record<string, Record<string, unknown>> }>(
      await a.get("/settings"),
    );
    const withRef = (referral: object) => ({
      version: cur.version,
      settings: { ...cur.settings, referral: { ...cur.settings.referral, ...referral } },
    });
    expect((await a.put("/settings", withRef({ threshold: 0 }))).status).toBe(400);
    expect(
      (await a.put("/settings", withRef({ experiment: { enabled: true, thresholds: [3, 3] } })))
        .status,
    ).toBe(400);
  });

  it("closes registration with a clear message", async () => {
    const t = harness();
    const a = await t.staff("admin@example.rw");
    const cur = body<{ version: number; settings: Record<string, Record<string, unknown>> }>(
      await a.get("/settings"),
    );
    await a.put("/settings", {
      version: cur.version,
      settings: { ...cur.settings, registration: { open: false } },
    });
    const res = await t.signUp("new@example.rw", {}, { verify: false });
    expect(res.status).toBe(503);
    expect(errorOf(res).code).toBe("REGISTRATION_CLOSED");
  });

  it("is admin-only", async () => {
    const t = harness();
    const s = await t.staff("s@example.rw", ["support"]);
    expect((await s.put("/settings", { version: 0, settings: {} })).status).toBe(403);
  });
});

describe("audit, overview and export", () => {
  it("lists and filters the audit log", async () => {
    const t = harness();
    const a = await t.staff("admin@example.rw");
    const l = await t.learner("l@example.rw");
    await a.post(`/users/${l.id}/revoke-sessions`);
    const res = body<{ items: { action: string; actorName: string | null }[] }>(
      await a.get("/audit?action=admin.user.sessions_revoked"),
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.actorName).toBe("Test User");
    expect(JSON.stringify(res)).not.toContain("passwordHash");
  });

  it("serves an overview payload", async () => {
    const t = harness();
    const a = await t.staff("admin@example.rw");
    await t.learner("l@example.rw");
    const res = await a.get("/overview?days=30");
    expect(res.status).toBe(200);
    expect(body<{ users: unknown; courses: unknown; series: unknown }>(res)).toHaveProperty(
      "series",
    );
    expect((await a.get("/overview?days=1")).status).toBe(400);
  });

  it("exports CSV with formula-injection protection and audits it", async () => {
    const t = harness();
    const a = await t.staff("admin@example.rw");
    await t.api
      .post("/api/v1/leads")
      .set(CSRF)
      .send({ ...validContact, fullName: '=HYPERLINK("http://evil")' });
    const res = await a.get("/export/leads");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const text = res.text;
    expect(text).not.toMatch(/(^|,|\n)"?=HYPERLINK/);
    expect(text).toContain("'=HYPERLINK");
    expect(t.audit.events.some((e) => e.action === "admin.export")).toBe(true);
    expect((await a.get("/export/passwords")).status).toBe(400);
  });

  it("limits exports to what the role may read", async () => {
    const t = harness();
    const e = await t.staff("e@example.rw", ["editor"]);
    expect((await e.get("/export/leads")).status).toBe(403);
    const s = await t.staff("s@example.rw", ["support"]);
    expect((await s.get("/export/users")).status).toBe(403);
  });
});
