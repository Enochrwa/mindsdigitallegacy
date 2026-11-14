import { Router } from "express";
import { z } from "zod";
import { AppError, notFound } from "../../core/errors.js";
import { SlugTakenError } from "../courses/courses.admin.js";
import type { CourseFields, LessonFields } from "../courses/courses.admin.js";
import {
  COURSE_LEVELS,
  COURSE_STATUSES,
  LANGUAGES,
  LESSON_KINDS,
  LESSON_STATUSES,
  SLUG_PATTERN,
  YOUTUBE_ID_PATTERN,
} from "../courses/courses.types.js";
import type { Course, Lesson } from "../courses/courses.types.js";
import { actorOf } from "./admin.context.js";
import type { AdminDeps, StaffGuards } from "./admin.context.js";
import { objectIdLike, pageQuery } from "./admin.shared.js";

const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(SLUG_PATTERN, "Use lower-case words joined by hyphens");
const text = (max: number) => z.string().trim().min(1).max(max);

const block = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("heading"), text: text(200) }),
  z.strictObject({ type: z.literal("paragraph"), text: text(4000) }),
  z.strictObject({
    type: z.literal("list"),
    ordered: z.boolean().optional(),
    items: z.array(text(400)).min(1).max(40),
  }),
  z.strictObject({
    type: z.literal("note"),
    tone: z.enum(["tip", "warning", "info"]).optional(),
    text: text(1000),
  }),
  z.strictObject({
    type: z.literal("code"),
    language: z.string().trim().max(20).optional(),
    text: text(4000),
  }),
]);
const blocks = z.array(block).max(200);

const unlockPolicy = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("open") }),
  z.strictObject({ type: z.literal("referral"), threshold: z.number().int().min(1).max(50) }),
  z.strictObject({ type: z.literal("code") }),
]);

const courseFields = z.strictObject({
  slug,
  categoryId: objectIdLike,
  title: text(100),
  summary: text(200),
  description: blocks,
  level: z.enum(COURSE_LEVELS),
  language: z.enum(LANGUAGES),
  order: z.number().int().min(0).max(10_000),
  tags: z.array(slug).max(12),
  outcomes: z.array(text(160)).max(12),
  audience: text(200),
  prerequisiteIds: z.array(objectIdLike).max(10),
  instructors: z.array(z.strictObject({ name: text(80), title: text(80) })).max(6),
  unlockPolicy,
});

const video = z.strictObject({
  provider: z.literal("youtube"),
  videoId: z.string().regex(YOUTUBE_ID_PATTERN, "A YouTube video id is 11 characters"),
  durationSec: z.number().int().min(1).max(14_400),
});
const lessonFields = z.strictObject({
  sectionId: objectIdLike,
  slug,
  title: text(120),
  summary: text(240),
  kind: z.enum(LESSON_KINDS),
  required: z.boolean(),
  isPreview: z.boolean(),
  video: video.optional(),
  body: blocks,
  transcript: z
    .strictObject({ language: z.enum(LANGUAGES), paragraphs: z.array(text(2000)).min(1).max(200) })
    .optional(),
  resources: z
    .array(
      z.strictObject({
        title: text(120),
        url: z.url({ protocol: /^https$/ }).max(500),
        kind: z.enum(["link", "download"]),
      }),
    )
    .max(20),
});

/** Same publishing rules as the content file validator, so the console cannot publish what the file could not. */
function lessonPublishProblems(l: Lesson): string[] {
  const out: string[] = [];
  if (l.kind === "video" && l.video === undefined)
    out.push("A video lesson needs a YouTube video id and duration.");
  if (l.kind === "reading" && l.video !== undefined)
    out.push("A reading lesson cannot have a video.");
  if (l.kind === "reading" && l.body.length === 0) out.push("A reading lesson needs text.");
  return out;
}

const conflict = (e: unknown): never => {
  if (e instanceof SlugTakenError)
    throw new AppError(409, "SLUG_TAKEN", "That web address name is already used. Choose another.");
  throw e;
};

export function createContentAdminRouter(deps: AdminDeps, guards: StaffGuards): Router {
  const router = Router();
  const repo = deps.catalogueAdmin;
  const idOf = (v: unknown): string => objectIdLike.parse(v);

  const courseView = async (course: Course) => {
    const [sections, lessons, categories, enrol] = await Promise.all([
      deps.catalogue.listSections(course.id),
      repo.listAllLessons(course.id),
      repo.listCategories(),
      deps.enrolments.statsByCourse(),
    ]);
    return {
      course,
      category: categories.find((c) => c.id === course.categoryId)?.name,
      sections,
      lessons,
      learners: enrol[course.id] ?? { active: 0, completed: 0, withdrawn: 0, locked: 0 },
    };
  };

  // ---- Categories ----
  router.get("/categories", ...guards.with("courses:read"), async (_req, res) => {
    res.json({ items: await repo.listCategories() });
  });
  const categoryBody = z.strictObject({
    slug,
    name: text(80),
    description: text(240),
    order: z.number().int().min(0).max(1000),
    visible: z.boolean(),
  });
  router.post("/categories", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const c = await repo.saveCategory(categoryBody.parse(req.body)).catch(conflict);
    await actor.record("admin.category.update", {
      targetType: "category",
      targetId: c?.id ?? "",
      detail: "create",
    });
    res.status(201).json({ category: c });
  });
  router.put("/categories/:id", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const c = await repo
      .saveCategory({ ...categoryBody.parse(req.body), id: idOf(req.params["id"]) })
      .catch(conflict);
    if (c === null) throw notFound();
    await actor.record("admin.category.update", {
      targetType: "category",
      targetId: c.id,
      detail: "update",
    });
    res.json({ category: c });
  });

  // ---- Courses ----
  const listQuery = z.strictObject({
    ...pageQuery,
    q: z.string().trim().max(100).optional(),
    status: z.enum(COURSE_STATUSES).optional(),
    categoryId: objectIdLike.optional(),
  });
  router.get("/courses", ...guards.with("courses:read"), async (req, res) => {
    const q = listQuery.parse(req.query);
    const [page, stats, categories] = await Promise.all([
      repo.listCourses(q),
      deps.enrolments.statsByCourse(),
      repo.listCategories(),
    ]);
    res.json({
      ...page,
      items: page.items.map((c) => ({
        ...c,
        categoryName: categories.find((x) => x.id === c.categoryId)?.name,
        learners: stats[c.id] ?? { active: 0, completed: 0, withdrawn: 0, locked: 0 },
      })),
      counts: await repo.countCourses(),
    });
  });

  router.get("/courses/:id", ...guards.with("courses:read"), async (req, res) => {
    const course = await repo.findCourseById(idOf(req.params["id"]));
    if (course === null) throw notFound();
    res.json(await courseView(course));
  });

  router.post("/courses", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const created = await repo
      .createCourse(courseFields.parse(req.body) as CourseFields, deps.now())
      .catch(conflict);
    await actor.record("admin.course.create", {
      targetType: "course",
      targetId: created?.id ?? "",
      detail: created?.slug,
    });
    res.status(201).json(await courseView(created));
  });

  router.put("/courses/:id", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const patch = courseFields.partial().parse(req.body) as Partial<CourseFields>;
    const updated = await repo
      .updateCourse(idOf(req.params["id"]), patch, deps.now())
      .catch(conflict);
    if (updated === null) throw notFound();
    await actor.record("admin.course.update", {
      targetType: "course",
      targetId: updated.id,
      detail: `fields: ${Object.keys(patch).join(",")}`,
    });
    res.json(await courseView(updated));
  });

  /** Publishing needs at least one published and one required lesson, and every published video lesson needs its video. */
  router.post("/courses/:id/status", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const { status } = z.strictObject({ status: z.enum(COURSE_STATUSES) }).parse(req.body);
    const id = idOf(req.params["id"]);
    const course = await repo.findCourseById(id);
    if (course === null) throw notFound();
    if (status === "published") {
      const lessons = (await repo.listAllLessons(id)).filter((l) => l.status === "published");
      const problems = [
        ...(lessons.length === 0 ? ["Publish at least one lesson first."] : []),
        ...(lessons.some((l) => l.required)
          ? []
          : ["At least one published lesson must be required."]),
        ...lessons.flatMap((l) => lessonPublishProblems(l).map((p) => `${l.title}: ${p}`)),
      ];
      if (problems.length > 0)
        throw new AppError(
          422,
          "NOT_PUBLISHABLE",
          "This course cannot be published yet.",
          problems.map((message) => ({ path: "course", message })),
        );
    }
    const updated = await repo.setCourseStatus(id, status, deps.now());
    await actor.record("admin.course.update", {
      targetType: "course",
      targetId: id,
      detail: `status: ${course.status} -> ${status}`,
    });
    res.json(await courseView(updated as Course));
  });

  // ---- Sections ----
  const sectionBody = z.strictObject({
    title: text(120),
    summary: z.string().trim().max(240).nullable().optional(),
  });
  router.post("/courses/:id/sections", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const b = sectionBody.parse(req.body);
    const s = await repo.createSection(
      idOf(req.params["id"]),
      b.title,
      b.summary ?? undefined,
      deps.now(),
    );
    if (s === null) throw notFound();
    await actor.record("admin.lesson.create", {
      targetType: "section",
      targetId: s.id,
      detail: s.title,
    });
    res.status(201).json({ section: s });
  });
  router.put("/sections/:id", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const s = await repo.updateSection(
      idOf(req.params["id"]),
      sectionBody.partial().parse(req.body),
      deps.now(),
    );
    if (s === null) throw notFound();
    await actor.record("admin.lesson.update", { targetType: "section", targetId: s.id });
    res.json({ section: s });
  });
  router.delete("/sections/:id", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const r = await repo.deleteSection(idOf(req.params["id"]), deps.now());
    if (r === "not_found") throw notFound();
    if (r === "not_empty")
      throw new AppError(409, "SECTION_NOT_EMPTY", "Move or retire this section's lessons first.");
    await actor.record("admin.lesson.update", {
      targetType: "section",
      targetId: idOf(req.params["id"]),
      detail: "delete",
    });
    res.status(204).end();
  });

  // ---- Lessons (full content, including drafts and video ids: staff only) ----
  router.get("/lessons/:id", ...guards.with("courses:read"), async (req, res) => {
    const lesson = await repo.findLessonById(idOf(req.params["id"]));
    if (lesson === null) throw notFound();
    res.json({ lesson });
  });
  router.post("/courses/:id/lessons", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const lesson = await repo
      .createLesson(
        idOf(req.params["id"]),
        lessonFields.parse(req.body) as LessonFields,
        deps.now(),
      )
      .catch(conflict);
    if (lesson === null) throw notFound();
    await actor.record("admin.lesson.create", {
      targetType: "lesson",
      targetId: lesson.id,
      detail: lesson.slug,
    });
    res.status(201).json({ lesson });
  });
  router.put("/lessons/:id", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const raw = req.body as Record<string, unknown>;
    const patch = lessonFields.partial().parse(raw) as Partial<LessonFields>;
    // Sending `video: null` / `transcript: null` removes it.
    const withClears: Partial<LessonFields> = {
      ...patch,
      ...(raw["video"] === null ? { video: undefined } : {}),
      ...(raw["transcript"] === null ? { transcript: undefined } : {}),
    };
    const lesson = await repo
      .updateLesson(idOf(req.params["id"]), withClears, deps.now())
      .catch(conflict);
    if (lesson === null) throw notFound();
    await actor.record("admin.lesson.update", {
      targetType: "lesson",
      targetId: lesson.id,
      detail: `fields: ${Object.keys(patch).join(",")}`,
    });
    res.json({ lesson });
  });
  router.post("/lessons/:id/status", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const { status } = z.strictObject({ status: z.enum(LESSON_STATUSES) }).parse(req.body);
    const id = idOf(req.params["id"]);
    const lesson = await repo.findLessonById(id);
    if (lesson === null) throw notFound();
    if (status === "published") {
      const problems = lessonPublishProblems(lesson);
      if (problems.length > 0)
        throw new AppError(
          422,
          "NOT_PUBLISHABLE",
          "This lesson cannot be published yet.",
          problems.map((message) => ({ path: "lesson", message })),
        );
    }
    const updated = await repo.setLessonStatus(id, status, deps.now());
    await actor.record("admin.lesson.update", {
      targetType: "lesson",
      targetId: id,
      detail: `status: ${lesson.status} -> ${status}`,
    });
    res.json({ lesson: updated });
  });
  router.put("/courses/:id/lesson-order", ...guards.with("courses:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const { layout } = z
      .strictObject({
        layout: z
          .array(z.strictObject({ lessonId: objectIdLike, sectionId: objectIdLike }))
          .max(500),
      })
      .parse(req.body);
    const id = idOf(req.params["id"]);
    if (!(await repo.reorderLessons(id, layout, deps.now())))
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "The order must list every lesson of the course exactly once.",
      );
    await actor.record("admin.lesson.update", {
      targetType: "course",
      targetId: id,
      detail: "reorder",
    });
    const course = await repo.findCourseById(id);
    res.json(await courseView(course as Course));
  });

  return router;
}
