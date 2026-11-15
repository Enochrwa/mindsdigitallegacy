import type { Page, PageRequest } from "../../core/page.js";
import type {
  Category,
  Course,
  CourseLevel,
  Enrolment,
  Language,
  Lesson,
  LessonProgress,
  Section,
  UnlockVia,
} from "./courses.types.js";

/** Read side of the catalogue. Content is written only by the import script (content.import.ts). */
export interface CatalogueRepository {
  listVisibleCategories(): Promise<Category[]>;
  listPublishedCourses(filter: {
    categorySlug?: string;
    level?: CourseLevel;
    language?: Language;
    tag?: string;
  }): Promise<Course[]>;
  /** Any status except draft is returned; callers decide who may see archived courses. */
  findCourseBySlug(slug: string): Promise<Course | null>;
  findCoursesByIds(ids: string[]): Promise<Course[]>;
  findCategoriesByIds(ids: string[]): Promise<Category[]>;
  listSections(courseId: string): Promise<Section[]>;
  /** Published lessons only, ordered. */
  listPublishedLessons(courseId: string): Promise<Lesson[]>;
}

export interface EnrolmentRepository {
  find(userId: string, courseId: string): Promise<Enrolment | null>;
  listForUser(userId: string): Promise<Enrolment[]>;
  /**
   * Creates the enrolment, or reactivates a withdrawn one (progress is kept). Idempotent: an active
   * enrolment is returned unchanged. Safe under concurrent requests (unique index on user and course).
   */
  enrol(input: {
    userId: string;
    courseId: string;
    access: Enrolment["access"];
    now: Date;
  }): Promise<Enrolment>;
  withdraw(id: string, at: Date): Promise<void>;
  recordActivity(id: string, lessonId: string, at: Date): Promise<void>;
  setCompleted(id: string, completedAt: Date | undefined): Promise<void>;
  unlock(id: string, via: UnlockVia, at: Date): Promise<void>;
  /** Takes access back (an unlock was revoked). Progress is kept. */
  lock(id: string): Promise<void>;
  /** Staff view across all learners. */
  list(query: EnrolmentListQuery): Promise<Page<Enrolment>>;
  /** Per course: how many learners are active, completed, withdrawn, and waiting on an unlock. */
  statsByCourse(): Promise<Record<string, EnrolmentStats>>;
  /** New enrolments per day since a date, for charts. */
  enrolmentsByDay(since: Date): Promise<{ day: string; count: number }[]>;
}

export interface EnrolmentListQuery extends PageRequest {
  courseId?: string | undefined;
  userId?: string | undefined;
  status?: Enrolment["status"] | undefined;
  accessState?: "locked" | "unlocked" | undefined;
}

export interface EnrolmentStats {
  active: number;
  completed: number;
  withdrawn: number;
  locked: number;
}

export interface ProgressRepository {
  find(userId: string, lessonId: string): Promise<LessonProgress | null>;
  listForCourse(userId: string, courseId: string): Promise<LessonProgress[]>;
  listForUser(userId: string): Promise<LessonProgress[]>;
  /** Creates or updates one row per learner and lesson. Completion is only ever set or cleared by `completed`. */
  save(input: {
    userId: string;
    courseId: string;
    lessonId: string;
    completed?: boolean;
    positionSec?: number;
    now: Date;
  }): Promise<LessonProgress>;
}
