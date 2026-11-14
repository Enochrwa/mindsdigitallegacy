import { academyContentSchema } from "./content.schema.js";
import type { AcademyContent } from "./content.schema.js";
import { computeCourseStats } from "./courses.types.js";
import type {
  ContentBlock,
  CourseStats,
  Language,
  LessonKind,
  LessonResource,
  LessonStatus,
} from "./courses.types.js";

/** Thrown with every problem found, so an author fixes them in one pass. */
export class ContentError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid academy content:\n- ${problems.join("\n- ")}`);
    this.name = "ContentError";
  }
}

export interface PreparedLesson {
  slug: string;
  title: string;
  summary: string;
  kind: LessonKind;
  status: LessonStatus;
  required: boolean;
  isPreview: boolean;
  order: number;
  video?: { provider: "youtube"; videoId: string; durationSec: number } | undefined;
  body: ContentBlock[];
  transcript?: { language: Language; paragraphs: string[] } | undefined;
  resources: LessonResource[];
}

export interface PreparedSection {
  order: number;
  title: string;
  summary?: string | undefined;
  lessons: PreparedLesson[];
}

export interface PreparedCourse {
  content: AcademyContent["courses"][number];
  stats: CourseStats;
  sections: PreparedSection[];
}

export interface PreparedContent {
  categories: AcademyContent["categories"];
  courses: PreparedCourse[];
}

function dupes(values: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const v of values) (seen.has(v) ? out : seen).add(v);
  return [...out];
}

/** Parses, applies cross-field rules, and derives counters and ordering. Pure: no database. */
export function validateAcademyContent(raw: unknown): PreparedContent {
  const parsed = academyContentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ContentError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  const content = parsed.data;
  const problems: string[] = [];

  for (const d of dupes(content.categories.map((c) => c.slug)))
    problems.push(`duplicate category slug "${d}"`);
  for (const d of dupes(content.courses.map((c) => c.slug)))
    problems.push(`duplicate course slug "${d}"`);
  const categorySlugs = new Set(content.categories.map((c) => c.slug));
  const courseSlugs = new Set(content.courses.map((c) => c.slug));

  const courses: PreparedCourse[] = content.courses.map((course) => {
    const at = `course "${course.slug}"`;
    if (!categorySlugs.has(course.categorySlug))
      problems.push(`${at}: unknown category "${course.categorySlug}"`);
    for (const p of course.prerequisites) {
      if (p === course.slug) problems.push(`${at}: lists itself as a prerequisite`);
      else if (!courseSlugs.has(p)) problems.push(`${at}: unknown prerequisite "${p}"`);
    }
    for (const d of dupes(course.sections.flatMap((s) => s.lessons.map((l) => l.slug)))) {
      problems.push(`${at}: duplicate lesson slug "${d}"`);
    }

    let order = 0;
    const sections: PreparedSection[] = course.sections.map((section, index) => ({
      order: index + 1,
      title: section.title,
      summary: section.summary,
      lessons: section.lessons.map((lesson): PreparedLesson => {
        order += 1;
        const lat = `${at}, lesson "${lesson.slug}"`;
        if (
          lesson.kind === "video" &&
          lesson.status === "published" &&
          lesson.video === undefined
        ) {
          problems.push(
            `${lat}: a published video lesson needs a video id (leave it as draft until the video is uploaded)`,
          );
        }
        if (lesson.kind === "reading" && lesson.video !== undefined)
          problems.push(`${lat}: reading lessons cannot have a video`);
        if (
          lesson.kind === "reading" &&
          lesson.status === "published" &&
          lesson.body.length === 0
        ) {
          problems.push(`${lat}: a published reading lesson needs body text`);
        }
        if (lesson.isPreview && lesson.status !== "published")
          problems.push(`${lat}: only published lessons can be previews`);
        return {
          slug: lesson.slug,
          title: lesson.title,
          summary: lesson.summary,
          kind: lesson.kind,
          status: lesson.status,
          required: lesson.required,
          isPreview: lesson.isPreview,
          order,
          video: lesson.video === undefined ? undefined : { provider: "youtube", ...lesson.video },
          body: lesson.body,
          transcript: lesson.transcript,
          resources: lesson.resources,
        };
      }),
    }));

    const all = sections.flatMap((s) => s.lessons);
    const stats = computeCourseStats(all);
    if (course.status === "published" && stats.lessonCount === 0)
      problems.push(`${at}: published courses need at least one published lesson`);
    if (course.status === "published" && stats.requiredLessonCount === 0)
      problems.push(`${at}: published courses need at least one required lesson`);
    return { content: course, stats, sections };
  });

  if (problems.length > 0) throw new ContentError(problems);
  return { categories: content.categories, courses };
}
