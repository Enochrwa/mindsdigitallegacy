/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest types response bodies as any */
import { readFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp, errorOf } from "../../testing/fixtures.js";
import { loadAcademyContentSync } from "./content.load.js";
import { validateAcademyContent } from "./content.validate.js";
import { buildCatalogueData, memoryCatalogue } from "../../testing/memory.js";

const PASSWORD = "correct horse battery";
const H = { "X-Requested-With": "mdl-web" };
const COURSE = "introduction-to-computers";

function setup() {
  const t = buildTestApp({
    env: { RATE_LIMIT_AUTH_PER_15MIN: "1000", RATE_LIMIT_LEARNING_PER_MINUTE: "1000" },
  });
  const api = request(t.app);
  const cookieOf = (res: { headers: Record<string, unknown> }): string =>
    ((res.headers["set-cookie"] as string[])[0] ?? "").split(";")[0] ?? "";
  const user = async (email: string): Promise<string> => {
    await api.post("/api/v1/auth/register").send({
      email,
      password: PASSWORD,
      displayName: "Learner",
      ageBracket: "16_plus",
      consent: true,
      privacyNoticeVersion: "2026-11",
    });
    const token = t.mailer.sent.filter((m) => m.kind === "verify" && m.to === email).at(-1)?.token;
    await api.post("/api/v1/auth/verify-email").send({ token });
    return cookieOf(await api.post("/api/v1/auth/login").send({ email, password: PASSWORD }));
  };
  return { ...t, api, user };
}

describe("authored academy content", () => {
  it("the shipped academy.json is valid and derives stats and order", () => {
    const content = loadAcademyContentSync();
    expect(content.courses.length).toBeGreaterThanOrEqual(2);
    const course = content.courses.find((c) => c.content.slug === COURSE);
    expect(course?.stats.lessonCount).toBeGreaterThan(0);
    const orders = course?.sections.flatMap((s) => s.lessons.map((l) => l.order)) ?? [];
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("reports every problem at once", () => {
    const raw = JSON.parse(JSON.stringify(loadAcademyRaw())) as {
      courses: { slug: string; categorySlug: string; prerequisites?: string[] }[];
    };
    const first = raw.courses[0];
    if (first === undefined) throw new Error("no course");
    first.categorySlug = "nope";
    first.prerequisites = [first.slug];
    expect(() => validateAcademyContent(raw)).toThrowError(/nope|prerequisite/i);
  });

  it("rejects unknown fields (strict schema)", () => {
    expect(() => validateAcademyContent({ categories: [], courses: [], extra: 1 })).toThrow();
  });
});

function loadAcademyRaw(): unknown {
  return JSON.parse(
    readFileSync(new URL("../../../content/academy.json", import.meta.url), "utf8"),
  ) as unknown;
}

describe("public catalogue", () => {
  it("lists published courses with cache headers and no personal or video data", async () => {
    const t = setup();
    const res = await t.api.get("/api/v1/courses");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("public");
    expect(res.body.courses.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(res.body)).not.toMatch(/videoId|transcript/);
  });

  it("filters by level and rejects unknown filters", async () => {
    const t = setup();
    expect((await t.api.get("/api/v1/courses?level=advanced")).body.courses).toEqual([]);
    expect((await t.api.get("/api/v1/courses?level=beginner")).body.courses.length).toBeGreaterThan(
      0,
    );
    expect((await t.api.get("/api/v1/courses?level=wizard")).status).toBe(400);
    expect((await t.api.get("/api/v1/courses?foo=1")).status).toBe(400);
  });

  it("returns course detail with outline and prerequisites, 404 for unknown or malformed slugs", async () => {
    const t = setup();
    const res = await t.api.get("/api/v1/courses/internet-and-email");
    expect(res.status).toBe(200);
    expect(res.body.course.prerequisites[0].slug).toBe(COURSE);
    expect(res.body.course.sections.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/videoId|transcript/);
    expect((await t.api.get("/api/v1/courses/does-not-exist")).status).toBe(404);
    expect((await t.api.get("/api/v1/courses/Bad_Slug")).status).toBe(400);
  });

  it("does not expose draft lessons in the outline", async () => {
    const t = setup();
    const res = await t.api.get(`/api/v1/courses/${COURSE}`);
    const sections = res.body.course.sections as { lessons: { slug: string }[] }[];
    const slugs = sections.flatMap((s) => s.lessons.map((l) => l.slug));
    expect(slugs).not.toContain("video-tour-of-the-desktop");
  });
});

describe("enrolment and lessons", () => {
  it("requires sign-in and the CSRF header for personal routes", async () => {
    const t = setup();
    expect((await t.api.post(`/api/v1/courses/${COURSE}/enrol`).set(H)).status).toBe(401);
    expect((await t.api.get("/api/v1/learning")).status).toBe(401);
    const cookie = await t.user("a@example.rw");
    expect((await t.api.post(`/api/v1/courses/${COURSE}/enrol`).set("Cookie", cookie)).status).toBe(
      403,
    );
  });

  it("enrols idempotently into an open course and unlocks it", async () => {
    const t = setup();
    const cookie = await t.user("a@example.rw");
    const a = await t.api.post(`/api/v1/courses/${COURSE}/enrol`).set(H).set("Cookie", cookie);
    const b = await t.api.post(`/api/v1/courses/${COURSE}/enrol`).set(H).set("Cookie", cookie);
    expect(a.status).toBe(201);
    expect(a.body.enrolment.access.state).toBe("unlocked");
    expect(b.body.enrolment.enrolledAt).toBe(a.body.enrolment.enrolledAt);
    expect(t.enrolments.all.size).toBe(1);
  });

  it("opens a lesson only after enrolment, but free previews are public", async () => {
    const t = setup();
    const path = `/api/v1/courses/${COURSE}/lessons`;
    expect((await t.api.get(`${path}/what-is-a-computer`)).status).toBe(200); // preview, anonymous
    expect((await t.api.get(`${path}/hardware-and-software`)).status).toBe(401);
    expect((await t.api.get(`${path}/what-is-a-computer`)).body.lesson.canTrackProgress).toBe(
      false,
    );
    const cookie = await t.user("a@example.rw");
    const denied = await t.api.get(`${path}/hardware-and-software`).set("Cookie", cookie);
    expect(denied.status).toBe(403);
    expect(errorOf(denied).code).toBe("ENROLMENT_REQUIRED");
    await t.api.post(`/api/v1/courses/${COURSE}/enrol`).set(H).set("Cookie", cookie);
    const ok = await t.api.get(`${path}/hardware-and-software`).set("Cookie", cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.lesson.body.length).toBeGreaterThan(0);
    expect(ok.body.lesson.next).toBeDefined();
    expect(ok.body.lesson.canTrackProgress).toBe(true);
  });

  it("tracks progress, completes the course, and keeps users isolated", async () => {
    const t = setup();
    const ada = await t.user("ada@example.rw");
    const bob = await t.user("bob@example.rw");
    await t.api.post(`/api/v1/courses/${COURSE}/enrol`).set(H).set("Cookie", ada);
    const detail = await t.api.get(`/api/v1/courses/${COURSE}`);
    const required = (
      detail.body.course.sections as { lessons: { slug: string; required: boolean }[] }[]
    )
      .flatMap((s) => s.lessons)
      .filter((l) => l.required);
    let last:
      { body: { enrolment: { status: string; progress: { percent: number } } } } | undefined;
    for (const l of required) {
      last = await t.api
        .put(`/api/v1/courses/${COURSE}/lessons/${l.slug}/progress`)
        .set(H)
        .set("Cookie", ada)
        .send({ completed: true });
      expect(last.body.enrolment).toBeDefined();
    }
    expect(last?.body.enrolment.status).toBe("completed");
    expect(last?.body.enrolment.progress.percent).toBe(100);

    // Bob never sees or changes Ada's progress.
    const bobMine = await t.api.get("/api/v1/learning").set("Cookie", bob);
    expect(bobMine.body.items).toEqual([]);
    const bobWrite = await t.api
      .put(`/api/v1/courses/${COURSE}/lessons/${required[0]?.slug}/progress`)
      .set(H)
      .set("Cookie", bob)
      .send({ completed: true });
    expect(bobWrite.status).toBe(403);

    // Un-completing a lesson reopens the course.
    const reopened = await t.api
      .put(`/api/v1/courses/${COURSE}/lessons/${required[0]?.slug}/progress`)
      .set(H)
      .set("Cookie", ada)
      .send({ completed: false });
    expect(reopened.body.enrolment.status).toBe("active");
    expect(t.audit.events.map((e) => e.action)).toEqual(
      expect.arrayContaining(["course.enrol", "course.complete", "course.uncomplete"]),
    );
  });

  it("validates the progress body strictly", async () => {
    const t = setup();
    const cookie = await t.user("a@example.rw");
    await t.api.post(`/api/v1/courses/${COURSE}/enrol`).set(H).set("Cookie", cookie);
    const put = (body: unknown) =>
      t.api
        .put(`/api/v1/courses/${COURSE}/lessons/hardware-and-software/progress`)
        .set(H)
        .set("Cookie", cookie)
        .send(body as object);
    expect((await put({})).status).toBe(400);
    expect((await put({ completed: "yes" })).status).toBe(400);
    expect((await put({ positionSec: -1 })).status).toBe(400);
    expect((await put({ completed: true, userId: "x" })).status).toBe(400);
  });

  it("withdraw keeps progress and re-enrolling restores it", async () => {
    const t = setup();
    const cookie = await t.user("a@example.rw");
    const call = (m: "post" | "delete") =>
      t.api[m](`/api/v1/courses/${COURSE}/enrol`).set(H).set("Cookie", cookie);
    await call("post");
    await t.api
      .put(`/api/v1/courses/${COURSE}/lessons/hardware-and-software/progress`)
      .set(H)
      .set("Cookie", cookie)
      .send({ completed: true });
    expect((await call("delete")).status).toBe(204);
    expect((await t.api.get("/api/v1/learning").set("Cookie", cookie)).body.items).toEqual([]);
    expect(
      (
        await t.api
          .get(`/api/v1/courses/${COURSE}/lessons/hardware-and-software`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(403);
    const again = await call("post");
    expect(again.body.enrolment.progress.completedRequired).toBe(1);
    expect(t.enrolments.all.size).toBe(1);
  });

  it("includes learning data in the self-service export", async () => {
    const t = setup();
    const cookie = await t.user("a@example.rw");
    await t.api.post(`/api/v1/courses/${COURSE}/enrol`).set(H).set("Cookie", cookie);
    const res = await t.api.get("/api/v1/users/me/export").set("Cookie", cookie);
    expect(res.body.learning.enrolments[0].course).toBe(COURSE);
  });
});

describe("locked and archived courses", () => {
  it("referral-policy courses enrol as locked and hide lesson content", async () => {
    const data = buildCatalogueData(loadAcademyContentSync(), new Date());
    const course = data.courses.find((c) => c.slug === COURSE);
    if (course === undefined) throw new Error("fixture");
    course.unlockPolicy = { type: "referral", threshold: 5 };
    const t = setup();
    // Swap the catalogue for a locked variant by rebuilding the app with it.
    const { createCoursesService } = await import("./courses.service.js");
    const svc = createCoursesService({
      catalogue: memoryCatalogue(data),
      enrolments: t.enrolments,
      progress: t.progress,
      audit: t.audit,
    });
    const ctx = { ip: "127.0.0.1", userAgent: "t", requestId: "r" };
    const enrolment = await svc.enrol("u1", COURSE, ctx);
    expect(enrolment.access.state).toBe("locked");
    await expect(svc.lesson("u1", COURSE, "hardware-and-software")).rejects.toMatchObject({
      code: "COURSE_LOCKED",
    });
    await expect(
      svc.saveProgress("u1", COURSE, "hardware-and-software", { completed: true }, ctx),
    ).rejects.toMatchObject({ code: "COURSE_LOCKED" });
  });
});
