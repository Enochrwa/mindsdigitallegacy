import type {
  Category,
  ContentBlock,
  Course,
  Enrolment,
  Lesson,
  LessonProgress,
} from "./courses.types.js";

/**
 * What the API returns. Every shape is an explicit allow-list built field by field, so adding a field to the
 * database model never exposes it by accident. In particular, video ids appear only in LessonDto.
 */
export interface CourseCardDto {
  slug: string;
  title: string;
  summary: string;
  level: Course["level"];
  language: Course["language"];
  category: { slug: string; name: string };
  tags: string[];
  instructors: Course["instructors"];
  stats: { lessonCount: number; totalDurationSec: number };
  unlockPolicy: { type: "open" | "referral" | "code"; threshold?: number };
}

export interface OutlineLessonDto {
  slug: string;
  title: string;
  summary: string;
  kind: Lesson["kind"];
  required: boolean;
  isPreview: boolean;
  durationSec?: number;
}

export interface CourseDetailDto extends CourseCardDto {
  description: ContentBlock[];
  outcomes: string[];
  audience: string;
  prerequisites: { slug: string; title: string }[];
  sections: { title: string; summary?: string; lessons: OutlineLessonDto[] }[];
}

export interface LessonDto extends OutlineLessonDto {
  body: ContentBlock[];
  transcript?: { language: string; paragraphs: string[] };
  resources: Lesson["resources"];
  video?: { provider: "youtube"; videoId: string; durationSec: number };
  /** True when the caller has unlocked access, so progress can be saved. False on anonymous previews. */
  canTrackProgress: boolean;
  course: { slug: string; title: string };
  position: { index: number; total: number };
  previous?: { slug: string; title: string };
  next?: { slug: string; title: string };
  progress?: { status: LessonProgress["status"]; positionSec?: number; completedAt?: string };
}

export interface EnrolmentDto {
  status: Enrolment["status"];
  access: { state: "locked" | "unlocked"; via?: string };
  enrolledAt: string;
  completedAt?: string;
  progress: { completedRequired: number; requiredTotal: number; percent: number };
  continueLesson?: { slug: string; title: string };
}

export function toCard(course: Course, category: Category | undefined): CourseCardDto {
  const policy = course.unlockPolicy;
  return {
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    level: course.level,
    language: course.language,
    category: { slug: category?.slug ?? "", name: category?.name ?? "" },
    tags: course.tags,
    instructors: course.instructors,
    stats: {
      lessonCount: course.stats.lessonCount,
      totalDurationSec: course.stats.totalDurationSec,
    },
    unlockPolicy:
      policy.type === "referral"
        ? { type: "referral", threshold: policy.threshold }
        : { type: policy.type },
  };
}

export function toOutlineLesson(lesson: Lesson): OutlineLessonDto {
  return {
    slug: lesson.slug,
    title: lesson.title,
    summary: lesson.summary,
    kind: lesson.kind,
    required: lesson.required,
    isPreview: lesson.isPreview,
    ...(lesson.video === undefined ? {} : { durationSec: lesson.video.durationSec }),
  };
}

export function toEnrolmentDto(
  enrolment: Enrolment,
  progress: EnrolmentDto["progress"],
  continueLesson: Lesson | undefined,
): EnrolmentDto {
  return {
    status: enrolment.status,
    access: {
      state: enrolment.access.state,
      ...(enrolment.access.via === undefined ? {} : { via: enrolment.access.via }),
    },
    enrolledAt: enrolment.enrolledAt.toISOString(),
    ...(enrolment.completedAt === undefined
      ? {}
      : { completedAt: enrolment.completedAt.toISOString() }),
    progress,
    ...(continueLesson === undefined
      ? {}
      : { continueLesson: { slug: continueLesson.slug, title: continueLesson.title } }),
  };
}
