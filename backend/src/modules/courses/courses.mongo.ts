import { trusted } from "mongoose";
import {
  CategoryModel,
  CourseModel,
  EnrolmentModel,
  LessonModel,
  ProgressModel,
  SectionModel,
} from "./courses.model.js";
import type {
  CatalogueRepository,
  EnrolmentRepository,
  ProgressRepository,
} from "./courses.repository.js";
import type {
  Category,
  ContentBlock,
  Course,
  Enrolment,
  Language,
  Lesson,
  LessonProgress,
  Section,
} from "./courses.types.js";

type Id = { toString(): string };
const s = (id: Id): string => id.toString();
const opt = <T>(v: T | null | undefined): T | undefined => v ?? undefined;

/* The repositories below use `trusted()` around every `$` operator in a filter. The connection enables
 * sanitizeFilter (db/connect.ts), which otherwise rewrites our own operators into `$eq` so they match nothing. */

interface CategoryDoc {
  _id: Id;
  slug: string;
  name: string;
  description: string;
  order: number;
  visible?: boolean;
}
interface CourseDoc {
  _id: Id;
  slug: string;
  categoryId: Id;
  title: string;
  summary: string;
  description?: ContentBlock[];
  level: Course["level"];
  language: Course["language"];
  status: Course["status"];
  order: number;
  tags?: string[];
  outcomes?: string[];
  audience: string;
  prerequisiteIds?: Id[];
  instructors?: Course["instructors"];
  unlockPolicy: { type: "open" | "referral" | "code"; threshold?: number | null };
  stats: Course["stats"];
  contentVersion: number;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
interface SectionDoc {
  _id: Id;
  courseId: Id;
  order: number;
  title: string;
  summary?: string | null;
}
interface LessonDoc {
  _id: Id;
  courseId: Id;
  sectionId: Id;
  order: number;
  slug: string;
  title: string;
  summary: string;
  kind: Lesson["kind"];
  status: Lesson["status"];
  required?: boolean;
  isPreview?: boolean;
  video?: { provider?: string; videoId?: string; durationSec?: number } | null;
  body?: ContentBlock[];
  transcript?: { language?: Language; paragraphs?: string[] } | null;
  resources?: Lesson["resources"];
  createdAt: Date;
  updatedAt: Date;
}
interface EnrolmentDoc {
  _id: Id;
  userId: Id;
  courseId: Id;
  status: Enrolment["status"];
  access: {
    state: "locked" | "unlocked";
    unlockedAt?: Date | null;
    via?: Enrolment["access"]["via"] | null;
  };
  enrolledAt: Date;
  completedAt?: Date | null;
  withdrawnAt?: Date | null;
  lastLessonId?: Id | null;
  lastActivityAt: Date;
}
interface ProgressDoc {
  _id: Id;
  userId: Id;
  courseId: Id;
  lessonId: Id;
  status: LessonProgress["status"];
  positionSec?: number | null;
  firstStartedAt: Date;
  lastActivityAt: Date;
  completedAt?: Date | null;
}

const toCategory = (d: CategoryDoc): Category => ({
  id: s(d._id),
  slug: d.slug,
  name: d.name,
  description: d.description,
  order: d.order,
  visible: d.visible ?? true,
});

const toCourse = (d: CourseDoc): Course => ({
  id: s(d._id),
  slug: d.slug,
  categoryId: s(d.categoryId),
  title: d.title,
  summary: d.summary,
  description: d.description ?? [],
  level: d.level,
  language: d.language,
  status: d.status,
  order: d.order,
  tags: d.tags ?? [],
  outcomes: d.outcomes ?? [],
  audience: d.audience,
  prerequisiteIds: (d.prerequisiteIds ?? []).map(s),
  instructors: d.instructors ?? [],
  unlockPolicy:
    d.unlockPolicy.type === "referral"
      ? { type: "referral", threshold: d.unlockPolicy.threshold ?? 1 }
      : { type: d.unlockPolicy.type },
  stats: d.stats,
  contentVersion: d.contentVersion,
  publishedAt: opt(d.publishedAt),
  archivedAt: opt(d.archivedAt),
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const toSection = (d: SectionDoc): Section => ({
  id: s(d._id),
  courseId: s(d.courseId),
  order: d.order,
  title: d.title,
  summary: opt(d.summary),
});

const toLesson = (d: LessonDoc): Lesson => ({
  id: s(d._id),
  courseId: s(d.courseId),
  sectionId: s(d.sectionId),
  order: d.order,
  slug: d.slug,
  title: d.title,
  summary: d.summary,
  kind: d.kind,
  status: d.status,
  required: d.required ?? true,
  isPreview: d.isPreview ?? false,
  video: d.video?.videoId
    ? { provider: "youtube", videoId: d.video.videoId, durationSec: d.video.durationSec ?? 0 }
    : undefined,
  body: d.body ?? [],
  transcript:
    d.transcript?.paragraphs && d.transcript.language
      ? { language: d.transcript.language, paragraphs: d.transcript.paragraphs }
      : undefined,
  resources: d.resources ?? [],
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const toEnrolment = (d: EnrolmentDoc): Enrolment => ({
  id: s(d._id),
  userId: s(d.userId),
  courseId: s(d.courseId),
  status: d.status,
  access: { state: d.access.state, unlockedAt: opt(d.access.unlockedAt), via: opt(d.access.via) },
  enrolledAt: d.enrolledAt,
  completedAt: opt(d.completedAt),
  withdrawnAt: opt(d.withdrawnAt),
  lastLessonId: d.lastLessonId ? s(d.lastLessonId) : undefined,
  lastActivityAt: d.lastActivityAt,
});

const toProgress = (d: ProgressDoc): LessonProgress => ({
  id: s(d._id),
  userId: s(d.userId),
  courseId: s(d.courseId),
  lessonId: s(d.lessonId),
  status: d.status,
  positionSec: opt(d.positionSec),
  firstStartedAt: d.firstStartedAt,
  lastActivityAt: d.lastActivityAt,
  completedAt: opt(d.completedAt),
});

const isDuplicateKey = (err: unknown): boolean =>
  typeof err === "object" && err !== null && "code" in err && err.code === 11000;

export function createMongoCatalogueRepository(): CatalogueRepository {
  return {
    async listVisibleCategories() {
      const docs = await CategoryModel.find({ visible: true }).sort({ order: 1 }).lean();
      return (docs as unknown as CategoryDoc[]).map(toCategory);
    },
    async listPublishedCourses(filter) {
      const query: Record<string, unknown> = { status: "published" };
      if (filter.categorySlug !== undefined) {
        const category = await CategoryModel.findOne({
          slug: filter.categorySlug,
          visible: true,
        }).lean();
        if (category === null) return [];
        query["categoryId"] = category._id;
      }
      if (filter.level !== undefined) query["level"] = filter.level;
      if (filter.language !== undefined) query["language"] = filter.language;
      if (filter.tag !== undefined) query["tags"] = filter.tag;
      const docs = await CourseModel.find(query).sort({ order: 1, slug: 1 }).limit(200).lean();
      return (docs as unknown as CourseDoc[]).map(toCourse);
    },
    async findCourseBySlug(slug) {
      const doc = await CourseModel.findOne({ slug, status: trusted({ $ne: "draft" }) }).lean();
      return doc === null ? null : toCourse(doc as unknown as CourseDoc);
    },
    async findCoursesByIds(ids) {
      const docs = await CourseModel.find({ _id: trusted({ $in: ids }) }).lean();
      return (docs as unknown as CourseDoc[]).map(toCourse);
    },
    async findCategoriesByIds(ids) {
      const docs = await CategoryModel.find({ _id: trusted({ $in: ids }) }).lean();
      return (docs as unknown as CategoryDoc[]).map(toCategory);
    },
    async listSections(courseId) {
      const docs = await SectionModel.find({ courseId }).sort({ order: 1 }).lean();
      return (docs as unknown as SectionDoc[]).map(toSection);
    },
    async listPublishedLessons(courseId) {
      const docs = await LessonModel.find({ courseId, status: "published" })
        .sort({ order: 1 })
        .lean();
      return (docs as unknown as LessonDoc[]).map(toLesson);
    },
  };
}

export function createMongoEnrolmentRepository(): EnrolmentRepository {
  const read = async (userId: string, courseId: string): Promise<Enrolment | null> => {
    const doc = await EnrolmentModel.findOne({ userId, courseId }).lean();
    return doc === null ? null : toEnrolment(doc as unknown as EnrolmentDoc);
  };
  return {
    find: read,
    async listForUser(userId) {
      const docs = await EnrolmentModel.find({ userId }).sort({ lastActivityAt: -1 }).lean();
      return (docs as unknown as EnrolmentDoc[]).map(toEnrolment);
    },
    async enrol({ userId, courseId, access, now }) {
      const attempt = async (): Promise<Enrolment> => {
        // Insert only when missing: two simultaneous requests end with exactly one row.
        await EnrolmentModel.updateOne(
          { userId, courseId },
          { $setOnInsert: { status: "active", access, enrolledAt: now, lastActivityAt: now } },
          { upsert: true },
        );
        // A withdrawn enrolment comes back with its progress intact.
        await EnrolmentModel.updateOne(
          { userId, courseId, status: "withdrawn" },
          { $set: { status: "active", lastActivityAt: now }, $unset: { withdrawnAt: 1 } },
        );
        const found = await read(userId, courseId);
        if (found === null) throw new Error("enrolment missing after upsert");
        return found;
      };
      try {
        return await attempt();
      } catch (err) {
        if (isDuplicateKey(err)) return attempt();
        throw err;
      }
    },
    async withdraw(id, at) {
      await EnrolmentModel.updateOne(
        { _id: id },
        { $set: { status: "withdrawn", withdrawnAt: at } },
      );
    },
    async recordActivity(id, lessonId, at) {
      await EnrolmentModel.updateOne(
        { _id: id },
        { $set: { lastLessonId: lessonId, lastActivityAt: at } },
      );
    },
    async setCompleted(id, completedAt) {
      if (completedAt === undefined) {
        await EnrolmentModel.updateOne(
          { _id: id, status: "completed" },
          { $set: { status: "active" }, $unset: { completedAt: 1 } },
        );
      } else {
        await EnrolmentModel.updateOne(
          { _id: id, status: "active" },
          { $set: { status: "completed", completedAt } },
        );
      }
    },
    async unlock(id, via, at) {
      await EnrolmentModel.updateOne(
        { _id: id },
        { $set: { "access.state": "unlocked", "access.via": via, "access.unlockedAt": at } },
      );
    },
  };
}

export function createMongoProgressRepository(): ProgressRepository {
  const find = async (userId: string, lessonId: string): Promise<LessonProgress | null> => {
    const doc = await ProgressModel.findOne({ userId, lessonId }).lean();
    return doc === null ? null : toProgress(doc);
  };
  return {
    find,
    async listForCourse(userId, courseId) {
      const docs = await ProgressModel.find({ userId, courseId }).lean();
      return (docs as unknown as ProgressDoc[]).map(toProgress);
    },
    async listForUser(userId) {
      const docs = await ProgressModel.find({ userId }).lean();
      return (docs as unknown as ProgressDoc[]).map(toProgress);
    },
    async save({ userId, courseId, lessonId, completed, positionSec, now }) {
      const set: Record<string, unknown> = { lastActivityAt: now };
      const unset: Record<string, 1> = {};
      if (positionSec !== undefined) set["positionSec"] = positionSec;
      if (completed === true) {
        set["status"] = "completed";
        const existing = await find(userId, lessonId);
        if (existing?.completedAt === undefined) set["completedAt"] = now;
      } else if (completed === false) {
        set["status"] = "in_progress";
        unset["completedAt"] = 1;
      }
      try {
        await ProgressModel.updateOne(
          { userId, lessonId },
          {
            $set: set,
            ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
            // `status` is set above when completion changes; otherwise a new row starts in progress.
            $setOnInsert: {
              courseId,
              firstStartedAt: now,
              ...(set["status"] === undefined ? { status: "in_progress" } : {}),
            },
          },
          { upsert: true },
        );
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        await ProgressModel.updateOne({ userId, lessonId }, { $set: set });
      }
      const saved = await find(userId, lessonId);
      if (saved === null) throw new Error("progress missing after save");
      return saved;
    },
  };
}
