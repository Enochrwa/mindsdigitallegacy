import { createHash } from "node:crypto";
import { trusted } from "mongoose";
import { CategoryModel, CourseModel, LessonModel, SectionModel } from "./courses.model.js";
import type { PreparedContent } from "./content.validate.js";

export interface ImportReport {
  categories: number;
  coursesCreated: string[];
  coursesUpdated: string[];
  coursesUnchanged: string[];
  /** Lessons present in the database but no longer in the file: set to draft, never deleted (learner progress refers to them). */
  lessonsRetired: string[];
  /** Courses in the database that the file does not mention. Left untouched. */
  coursesNotInFile: string[];
}

const hashOf = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Idempotent: running it twice changes nothing the second time. Courses are matched by slug, lessons by
 * (course, slug), sections by (course, order). A course's `contentVersion` goes up only when its authored
 * content hash changes, so the version number means "the content was edited".
 */
export async function importAcademyContent(
  prepared: PreparedContent,
  now: Date = new Date(),
): Promise<ImportReport> {
  const report: ImportReport = {
    categories: 0,
    coursesCreated: [],
    coursesUpdated: [],
    coursesUnchanged: [],
    lessonsRetired: [],
    coursesNotInFile: [],
  };

  const categoryIds = new Map<string, string>();
  for (const c of prepared.categories) {
    const doc = await CategoryModel.findOneAndUpdate(
      { slug: c.slug },
      { $set: { name: c.name, description: c.description, order: c.order, visible: c.visible } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    categoryIds.set(c.slug, String(doc._id));
    report.categories += 1;
  }

  const courseIds = new Map<string, string>();
  for (const course of prepared.courses) {
    const c = course.content;
    const contentHash = hashOf({ content: c, stats: course.stats });
    const existing = await CourseModel.findOne({ slug: c.slug }).lean();
    const status = c.status;
    const fields = {
      categoryId: categoryIds.get(c.categorySlug),
      title: c.title,
      summary: c.summary,
      description: c.description,
      level: c.level,
      language: c.language,
      status,
      order: c.order,
      tags: c.tags,
      outcomes: c.outcomes,
      audience: c.audience,
      instructors: c.instructors,
      unlockPolicy: c.unlockPolicy,
      stats: course.stats,
      contentHash,
    };
    if (existing === null) {
      const created = await CourseModel.create({
        slug: c.slug,
        ...fields,
        prerequisiteIds: [],
        contentVersion: 1,
        ...(status === "published" ? { publishedAt: now } : {}),
        ...(status === "archived" ? { archivedAt: now } : {}),
      });
      courseIds.set(c.slug, String(created._id));
      report.coursesCreated.push(c.slug);
    } else {
      courseIds.set(c.slug, String(existing._id));
      const changed = existing.contentHash !== contentHash;
      await CourseModel.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...fields,
            ...(status === "published" && existing.publishedAt === undefined
              ? { publishedAt: now }
              : {}),
            ...(status === "archived" && existing.archivedAt === undefined
              ? { archivedAt: now }
              : {}),
          },
          ...(changed ? { $inc: { contentVersion: 1 } } : {}),
        },
      );
      (changed ? report.coursesUpdated : report.coursesUnchanged).push(c.slug);
    }
  }

  // Second pass: prerequisites reference course ids, which exist only after the first pass.
  for (const course of prepared.courses) {
    const id = courseIds.get(course.content.slug);
    const prereqs = course.content.prerequisites
      .map((slug) => courseIds.get(slug))
      .filter((v): v is string => v !== undefined);
    await CourseModel.updateOne({ _id: id }, { $set: { prerequisiteIds: prereqs } });
  }

  for (const course of prepared.courses) {
    const courseId = courseIds.get(course.content.slug) as string;
    const sectionIds = new Map<number, string>();
    for (const section of course.sections) {
      const doc = await SectionModel.findOneAndUpdate(
        { courseId, order: section.order },
        {
          $set: {
            title: section.title,
            ...(section.summary === undefined ? {} : { summary: section.summary }),
          },
          ...(section.summary === undefined ? { $unset: { summary: 1 } } : {}),
        },
        { upsert: true, returnDocument: "after" },
      ).lean();
      sectionIds.set(section.order, String(doc._id));
      for (const lesson of section.lessons) {
        await LessonModel.updateOne(
          { courseId, slug: lesson.slug },
          {
            $set: {
              sectionId: sectionIds.get(section.order),
              order: lesson.order,
              title: lesson.title,
              summary: lesson.summary,
              kind: lesson.kind,
              status: lesson.status,
              required: lesson.required,
              isPreview: lesson.isPreview,
              body: lesson.body,
              resources: lesson.resources,
              ...(lesson.video === undefined ? {} : { video: lesson.video }),
              ...(lesson.transcript === undefined ? {} : { transcript: lesson.transcript }),
            },
            ...(lesson.video === undefined || lesson.transcript === undefined
              ? {
                  $unset: {
                    ...(lesson.video === undefined ? { video: 1 } : {}),
                    ...(lesson.transcript === undefined ? { transcript: 1 } : {}),
                  },
                }
              : {}),
          },
          { upsert: true },
        );
      }
    }
    const keep = course.sections.flatMap((s) => s.lessons.map((l) => l.slug));
    const stale = await LessonModel.find({ courseId, slug: trusted({ $nin: keep }) }).lean();
    for (const l of stale) {
      if (l.status !== "draft") report.lessonsRetired.push(`${course.content.slug}/${l.slug}`);
    }
    await LessonModel.updateMany(
      { courseId, slug: trusted({ $nin: keep }) },
      { $set: { status: "draft" } },
    );
  }

  const inFile = new Set(prepared.courses.map((c) => c.content.slug));
  for (const c of await CourseModel.find({}, { slug: 1 }).lean())
    if (!inFile.has(c.slug)) report.coursesNotInFile.push(c.slug);
  return report;
}
