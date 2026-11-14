import { Types, trusted } from "mongoose";
import { escapeRegex } from "../../core/page.js";
import type { Page, PageRequest } from "../../core/page.js";
import { CategoryModel, CourseModel, LessonModel, SectionModel } from "./courses.model.js";
import { toCategory, toCourse, toLesson, toSection } from "./courses.mongo.js";
import { computeCourseStats } from "./courses.types.js";
import type {
  Category,
  ContentBlock,
  Course,
  CourseInstructor,
  CourseLevel,
  CourseStats,
  CourseStatus,
  Language,
  Lesson,
  LessonKind,
  LessonResource,
  LessonStatus,
  Section,
  UnlockPolicy,
} from "./courses.types.js";

export class SlugTakenError extends Error {
  constructor() {
    super("SLUG_TAKEN");
  }
}

export interface CourseFields {
  slug: string;
  categoryId: string;
  title: string;
  summary: string;
  description: ContentBlock[];
  level: CourseLevel;
  language: Language;
  order: number;
  tags: string[];
  outcomes: string[];
  audience: string;
  prerequisiteIds: string[];
  instructors: CourseInstructor[];
  unlockPolicy: UnlockPolicy;
}

export interface LessonFields {
  sectionId: string;
  slug: string;
  title: string;
  summary: string;
  kind: LessonKind;
  required: boolean;
  isPreview: boolean;
  video?: Lesson["video"] | undefined;
  body: ContentBlock[];
  transcript?: Lesson["transcript"] | undefined;
  resources: LessonResource[];
}

export interface CourseListQuery extends PageRequest {
  q?: string | undefined;
  status?: CourseStatus | undefined;
  categoryId?: string | undefined;
}

/**
 * Write side of the academy, used only by the admin console. Every write marks the course as
 * `source: "admin"` and bumps `contentVersion`, so a later import of content/academy.json never
 * overwrites console edits and the version number keeps meaning "the content was edited".
 */
export interface CatalogueAdminRepository {
  listCategories(): Promise<Category[]>;
  saveCategory(input: {
    id?: string | undefined;
    slug: string;
    name: string;
    description: string;
    order: number;
    visible: boolean;
  }): Promise<Category | null>;
  listCourses(query: CourseListQuery): Promise<Page<Course>>;
  findCourseById(id: string): Promise<Course | null>;
  createCourse(input: CourseFields, now: Date): Promise<Course>;
  updateCourse(id: string, patch: Partial<CourseFields>, now: Date): Promise<Course | null>;
  setCourseStatus(id: string, status: CourseStatus, now: Date): Promise<Course | null>;
  listAllLessons(courseId: string): Promise<Lesson[]>;
  findLessonById(id: string): Promise<Lesson | null>;
  createSection(
    courseId: string,
    title: string,
    summary: string | undefined,
    now: Date,
  ): Promise<Section | null>;
  updateSection(
    id: string,
    patch: { title?: string; summary?: string | null },
    now: Date,
  ): Promise<Section | null>;
  /** Refuses (returns "not_empty") while the section still has lessons. */
  deleteSection(id: string, now: Date): Promise<"ok" | "not_empty" | "not_found">;
  createLesson(courseId: string, input: LessonFields, now: Date): Promise<Lesson | null>;
  updateLesson(id: string, patch: Partial<LessonFields>, now: Date): Promise<Lesson | null>;
  setLessonStatus(id: string, status: LessonStatus, now: Date): Promise<Lesson | null>;
  /** Places lessons in the given order (and section) across the course. Ids must be exactly the course's lessons. */
  reorderLessons(
    courseId: string,
    layout: { lessonId: string; sectionId: string }[],
    now: Date,
  ): Promise<boolean>;
  countCourses(): Promise<Record<CourseStatus, number>>;
}

const dup = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && e.code === 11000;
const oid = (id: string): boolean => Types.ObjectId.isValid(id);

export function createMongoCatalogueAdminRepository(): CatalogueAdminRepository {
  /** Called after every content write: recomputes counters and takes ownership of the course. */
  async function touch(courseId: string, now: Date): Promise<void> {
    const lessons = (await LessonModel.find({ courseId }).lean()).map((l) => toLesson(l as never));
    const stats: CourseStats = computeCourseStats(lessons);
    await CourseModel.updateOne(
      { _id: courseId },
      {
        $set: { stats, source: "admin", contentHash: "admin", updatedAt: now },
        $inc: { contentVersion: 1 },
      },
    );
  }
  const lessonDoc = (f: Partial<LessonFields>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...f };
    delete out["video"];
    delete out["transcript"];
    return out;
  };

  return {
    async listCategories() {
      return (await CategoryModel.find().sort({ order: 1 }).lean()).map((d) =>
        toCategory(d as never),
      );
    },
    async saveCategory(input) {
      try {
        const fields = {
          slug: input.slug,
          name: input.name,
          description: input.description,
          order: input.order,
          visible: input.visible,
          source: "admin" as const,
        };
        if (input.id === undefined)
          return toCategory((await CategoryModel.create(fields)).toObject());
        if (!oid(input.id)) return null;
        const d = await CategoryModel.findOneAndUpdate(
          { _id: input.id },
          { $set: fields },
          { returnDocument: "after" },
        ).lean();
        return d === null ? null : toCategory(d);
      } catch (e) {
        if (dup(e)) throw new SlugTakenError();
        throw e;
      }
    },
    async listCourses({ q, status, categoryId, page, pageSize }) {
      const f: Record<string, unknown> = {};
      if (status) f["status"] = status;
      if (categoryId) f["categoryId"] = categoryId;
      if (q?.trim()) {
        const safe = escapeRegex(q.trim());
        f["$or"] = [
          { title: trusted({ $regex: safe, $options: "i" }) },
          { slug: trusted({ $regex: `^${safe.toLowerCase()}` }) },
        ];
      }
      const filter = trusted(f) as never;
      const [docs, total] = await Promise.all([
        CourseModel.find(filter)
          .sort({ order: 1, slug: 1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        CourseModel.countDocuments(filter),
      ]);
      return { items: docs.map((d) => toCourse(d as never)), total, page, pageSize };
    },
    async findCourseById(id) {
      if (!oid(id)) return null;
      const d = await CourseModel.findById(id).lean();
      return d === null ? null : toCourse(d as never);
    },
    async createCourse(input, now) {
      try {
        const d = await CourseModel.create({
          ...input,
          unlockPolicy:
            input.unlockPolicy.type === "referral"
              ? { type: "referral", threshold: input.unlockPolicy.threshold }
              : { type: input.unlockPolicy.type },
          status: "draft",
          stats: { lessonCount: 0, requiredLessonCount: 0, totalDurationSec: 0 },
          contentVersion: 1,
          contentHash: "admin",
          source: "admin",
          createdAt: now,
        });
        return toCourse(d.toObject() as never);
      } catch (e) {
        if (dup(e)) throw new SlugTakenError();
        throw e;
      }
    },
    async updateCourse(id, patch, now) {
      if (!oid(id)) return null;
      try {
        const set: Record<string, unknown> = { ...patch };
        if (patch.unlockPolicy)
          set["unlockPolicy"] =
            patch.unlockPolicy.type === "referral"
              ? { type: "referral", threshold: patch.unlockPolicy.threshold }
              : { type: patch.unlockPolicy.type };
        const d = await CourseModel.findOneAndUpdate(
          { _id: id },
          {
            $set: { ...set, source: "admin", contentHash: "admin", updatedAt: now },
            $inc: { contentVersion: 1 },
          },
          { returnDocument: "after" },
        ).lean();
        return d === null ? null : toCourse(d as never);
      } catch (e) {
        if (dup(e)) throw new SlugTakenError();
        throw e;
      }
    },
    async setCourseStatus(id, status, now) {
      if (!oid(id)) return null;
      const stamp =
        status === "published"
          ? { publishedAt: now }
          : status === "archived"
            ? { archivedAt: now }
            : {};
      const d = await CourseModel.findOneAndUpdate(
        { _id: id },
        {
          $set: { status, source: "admin", contentHash: "admin", ...stamp },
          $inc: { contentVersion: 1 },
        },
        { returnDocument: "after" },
      ).lean();
      return d === null ? null : toCourse(d as never);
    },
    async listAllLessons(courseId) {
      if (!oid(courseId)) return [];
      return (await LessonModel.find({ courseId }).sort({ order: 1 }).lean()).map((d) =>
        toLesson(d as never),
      );
    },
    async findLessonById(id) {
      if (!oid(id)) return null;
      const d = await LessonModel.findById(id).lean();
      return d === null ? null : toLesson(d as never);
    },
    async createSection(courseId, title, summary, now) {
      if (!oid(courseId) || (await CourseModel.exists({ _id: courseId })) === null) return null;
      const last = await SectionModel.findOne({ courseId }).sort({ order: -1 }).lean();
      const d = await SectionModel.create({
        courseId,
        order: (last?.order ?? 0) + 1,
        title,
        ...(summary ? { summary } : {}),
      });
      await touch(courseId, now);
      return toSection(d.toObject());
    },
    async updateSection(id, patch, now) {
      if (!oid(id)) return null;
      const d = await SectionModel.findOneAndUpdate(
        { _id: id },
        {
          ...(patch.title === undefined && patch.summary === undefined
            ? {}
            : {
                $set: {
                  ...(patch.title === undefined ? {} : { title: patch.title }),
                  ...(typeof patch.summary === "string" ? { summary: patch.summary } : {}),
                },
              }),
          ...(patch.summary === null ? { $unset: { summary: 1 } } : {}),
        },
        { returnDocument: "after" },
      ).lean();
      if (d === null) return null;
      await touch(String(d.courseId), now);
      return toSection(d);
    },
    async deleteSection(id, now) {
      if (!oid(id)) return "not_found";
      const section = await SectionModel.findById(id).lean();
      if (section === null) return "not_found";
      if ((await LessonModel.exists({ sectionId: id })) !== null) return "not_empty";
      await SectionModel.deleteOne({ _id: id });
      await touch(String(section.courseId), now);
      return "ok";
    },
    async createLesson(courseId, input, now) {
      if (!oid(courseId) || (await CourseModel.exists({ _id: courseId })) === null) return null;
      const last = await LessonModel.findOne({ courseId }).sort({ order: -1 }).lean();
      try {
        const d = await LessonModel.create({
          ...lessonDoc(input),
          courseId,
          order: (last?.order ?? 0) + 1,
          status: "draft",
          ...(input.video ? { video: input.video } : {}),
          ...(input.transcript ? { transcript: input.transcript } : {}),
        });
        await touch(courseId, now);
        return toLesson(d.toObject() as never);
      } catch (e) {
        if (dup(e)) throw new SlugTakenError();
        throw e;
      }
    },
    async updateLesson(id, patch, now) {
      if (!oid(id)) return null;
      const unset: Record<string, 1> = {};
      if ("video" in patch && patch.video === undefined) unset["video"] = 1;
      if ("transcript" in patch && patch.transcript === undefined) unset["transcript"] = 1;
      const set = {
        ...lessonDoc(patch),
        ...(patch.video ? { video: patch.video } : {}),
        ...(patch.transcript ? { transcript: patch.transcript } : {}),
      };
      try {
        const d = await LessonModel.findOneAndUpdate(
          { _id: id },
          {
            ...(Object.keys(set).length ? { $set: set } : {}),
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
          },
          { returnDocument: "after" },
        ).lean();
        if (d === null) return null;
        await touch(String(d.courseId), now);
        return toLesson(d as never);
      } catch (e) {
        if (dup(e)) throw new SlugTakenError();
        throw e;
      }
    },
    async setLessonStatus(id, status, now) {
      if (!oid(id)) return null;
      const d = await LessonModel.findOneAndUpdate(
        { _id: id },
        { $set: { status } },
        { returnDocument: "after" },
      ).lean();
      if (d === null) return null;
      await touch(String(d.courseId), now);
      return toLesson(d as never);
    },
    async reorderLessons(courseId, layout, now) {
      if (!oid(courseId)) return false;
      const existing = await LessonModel.find({ courseId }, { _id: 1 }).lean();
      const ids = new Set(existing.map((l) => String(l._id)));
      if (layout.length !== ids.size || !layout.every((l) => ids.has(l.lessonId))) return false;
      await LessonModel.bulkWrite(
        layout.map((l, i) => ({
          updateOne: {
            filter: { _id: l.lessonId },
            update: { $set: { order: i + 1, sectionId: l.sectionId } },
          },
        })),
      );
      await touch(courseId, now);
      return true;
    },
    async countCourses() {
      const rows = await CourseModel.aggregate<{ _id: CourseStatus; n: number }>([
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]);
      const out: Record<CourseStatus, number> = { draft: 0, published: 0, archived: 0 };
      for (const r of rows) out[r._id] = r.n;
      return out;
    },
  };
}
