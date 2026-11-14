/**
 * Academy domain model. Every field is documented here and in docs/07-data-model.md.
 *
 * Conventions that keep the data clean:
 *  - Closed vocabularies are string unions, enforced three times: Zod (API and content import),
 *    Mongoose enums (database writes) and TypeScript (compile time).
 *  - `slug` is the public, stable identifier (lower-case kebab). `id` is internal and never shown in URLs.
 *  - Content blocks are structured data, never HTML, so rendering cannot inject markup.
 *  - Counters that could drift (lesson counts, durations) are derived by one function, `computeCourseStats`,
 *    and checked by the content validator.
 */

export const COURSE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const LANGUAGES = ["en", "rw", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

/** draft: being written, invisible. published: visible. archived: hidden from the catalogue, kept for learners who started it. */
export const COURSE_STATUSES = ["draft", "published", "archived"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const LESSON_STATUSES = ["draft", "published"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

/** `video` plays a YouTube video; `reading` is text only. Room to add `quiz` and `assignment` later. */
export const LESSON_KINDS = ["video", "reading"] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

/**
 * How a learner gains access (ADR-0002).
 *  open: anyone with a verified account.
 *  referral: needs `threshold` verified invitations (Sprint 3).
 *  code: needs an ambassador or partner code (later).
 */
export type UnlockPolicy =
  { type: "open" } | { type: "referral"; threshold: number } | { type: "code" };

/** Why an enrolment is unlocked. `admin` covers manual grants by staff. */
export const UNLOCK_VIAS = ["open", "referral", "code", "admin"] as const;
export type UnlockVia = (typeof UNLOCK_VIAS)[number];

export type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "note"; text: string }
  | { type: "code"; language: string; text: string };

export interface LessonResource {
  title: string;
  /** https only. Validated on import. */
  url: string;
  kind: "link" | "download";
}

export interface LessonVideo {
  provider: "youtube";
  /** 11 characters from [A-Za-z0-9_-]. Never returned to someone without access (ADR-0005). */
  videoId: string;
  durationSec: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  order: number;
  visible: boolean;
}

export interface CourseInstructor {
  name: string;
  title: string;
}

export interface CourseStats {
  /** Published lessons. */
  lessonCount: number;
  /** Published lessons that must be completed to finish the course (`required: true`). */
  requiredLessonCount: number;
  /** Sum of published video durations, in seconds. */
  totalDurationSec: number;
}

export interface Course {
  id: string;
  slug: string;
  categoryId: string;
  title: string;
  /** One or two sentences for cards and search results (max 200 characters). */
  summary: string;
  /** Longer description shown on the course page. */
  description: ContentBlock[];
  level: CourseLevel;
  language: Language;
  status: CourseStatus;
  order: number;
  tags: string[];
  /** "What you will learn" bullets. */
  outcomes: string[];
  /** Who the course is for, in one sentence. */
  audience: string;
  /** Courses recommended first. Informational, not enforced. */
  prerequisiteIds: string[];
  instructors: CourseInstructor[];
  unlockPolicy: UnlockPolicy;
  stats: CourseStats;
  /** Incremented on each content import that changes the course, so history is explainable. */
  contentVersion: number;
  publishedAt?: Date | undefined;
  archivedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface Section {
  id: string;
  courseId: string;
  order: number;
  title: string;
  summary?: string | undefined;
}

export interface Lesson {
  id: string;
  courseId: string;
  sectionId: string;
  /** Position within the course across sections (1-based, in reading order; drafts keep their slot and are skipped in navigation). */
  order: number;
  /** Unique within the course. */
  slug: string;
  title: string;
  summary: string;
  kind: LessonKind;
  status: LessonStatus;
  /** Counts toward course completion. Optional extras set this to false. */
  required: boolean;
  /** Free sample: playable and readable without enrolment. Off by default. */
  isPreview: boolean;
  video?: LessonVideo | undefined;
  /** Notes or the whole lesson for reading lessons. */
  body: ContentBlock[];
  transcript?: { language: Language; paragraphs: string[] } | undefined;
  resources: LessonResource[];
  createdAt: Date;
  updatedAt: Date;
}

export const ENROLMENT_STATUSES = ["active", "completed", "withdrawn"] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

export interface Enrolment {
  id: string;
  userId: string;
  courseId: string;
  status: EnrolmentStatus;
  access: {
    state: "locked" | "unlocked";
    unlockedAt?: Date | undefined;
    via?: UnlockVia | undefined;
  };
  enrolledAt: Date;
  completedAt?: Date | undefined;
  withdrawnAt?: Date | undefined;
  /** For "continue where you left off". */
  lastLessonId?: string | undefined;
  lastActivityAt: Date;
}

export interface LessonProgress {
  id: string;
  userId: string;
  /** Copied from the lesson so a learner's course progress is one indexed query. */
  courseId: string;
  lessonId: string;
  status: "in_progress" | "completed";
  /** Playback position. Reserved: stored when the client reports it, not yet reported by the web app. */
  positionSec?: number | undefined;
  firstStartedAt: Date;
  lastActivityAt: Date;
  completedAt?: Date | undefined;
}

/** The single place counters are derived. Only published lessons count. */
export function computeCourseStats(
  lessons: Pick<Lesson, "status" | "required" | "video">[],
): CourseStats {
  const published = lessons.filter((l) => l.status === "published");
  return {
    lessonCount: published.length,
    requiredLessonCount: published.filter((l) => l.required).length,
    totalDurationSec: published.reduce((sum, l) => sum + (l.video?.durationSec ?? 0), 0),
  };
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
