import { AppError, notFound } from "../../core/errors.js";
import { ipPrefix } from "../../core/security/tokens.js";
import type { AuditAction, AuditLog } from "../audit/audit.js";
import type { RequestContext } from "../auth/auth.service.js";
import type { CourseCardDto, CourseDetailDto, EnrolmentDto, LessonDto } from "./courses.dto.js";
import { toCard, toEnrolmentDto, toOutlineLesson } from "./courses.dto.js";
import type {
  CatalogueRepository,
  EnrolmentRepository,
  ProgressRepository,
} from "./courses.repository.js";
import type {
  Category,
  Course,
  CourseLevel,
  Enrolment,
  Language,
  Lesson,
  LessonProgress,
} from "./courses.types.js";

export interface CoursesDeps {
  catalogue: CatalogueRepository;
  enrolments: EnrolmentRepository;
  progress: ProgressRepository;
  audit: AuditLog;
  now?: () => Date;
}

const enrolmentRequired = (): AppError =>
  new AppError(403, "ENROLMENT_REQUIRED", "Enrol in this course to open its lessons.");
const courseLocked = (): AppError =>
  new AppError(403, "COURSE_LOCKED", "This course is not unlocked for you yet.");

export function createCoursesService(deps: CoursesDeps) {
  const { catalogue, enrolments, progress, audit } = deps;
  const now = deps.now ?? ((): Date => new Date());

  const record = (action: AuditAction, ctx: RequestContext, userId: string, courseSlug: string) =>
    audit.append({
      at: now(),
      actorId: userId,
      action,
      requestId: ctx.requestId,
      ipPrefix: ipPrefix(ctx.ip),
      outcome: "success",
      meta: { courseSlug },
    });

  /** Any non-draft course, but archived ones only for someone who already started them. */
  async function visibleCourse(slug: string, enrolment: Enrolment | null): Promise<Course> {
    const course = await catalogue.findCourseBySlug(slug);
    if (course === null) throw notFound();
    if (course.status === "archived" && (enrolment === null || enrolment.status === "withdrawn"))
      throw notFound();
    return course;
  }

  function summarise(
    lessons: Lesson[],
    rows: LessonProgress[],
  ): { progress: EnrolmentDto["progress"]; next: Lesson | undefined } {
    const done = new Set(rows.filter((r) => r.status === "completed").map((r) => r.lessonId));
    const required = lessons.filter((l) => l.required);
    const completedRequired = required.filter((l) => done.has(l.id)).length;
    const percent =
      required.length === 0 ? 0 : Math.round((completedRequired / required.length) * 100);
    return {
      progress: { completedRequired, requiredTotal: required.length, percent },
      next: lessons.find((l) => !done.has(l.id)),
    };
  }

  async function enrolmentView(
    course: Course,
    enrolment: Enrolment,
    userId: string,
  ): Promise<EnrolmentDto> {
    const [lessons, rows] = await Promise.all([
      catalogue.listPublishedLessons(course.id),
      progress.listForCourse(userId, course.id),
    ]);
    const { progress: summary, next } = summarise(lessons, rows);
    const last = lessons.find((l) => l.id === enrolment.lastLessonId);
    return toEnrolmentDto(
      enrolment,
      summary,
      enrolment.status === "completed" ? last : (next ?? last),
    );
  }

  function hasAccess(course: Course, enrolment: Enrolment | null): boolean {
    return (
      enrolment !== null &&
      enrolment.status !== "withdrawn" &&
      enrolment.access.state === "unlocked" &&
      course.status !== "draft"
    );
  }

  async function cardsFor(courses: Course[]): Promise<CourseCardDto[]> {
    const categories = await catalogue.findCategoriesByIds([
      ...new Set(courses.map((c) => c.categoryId)),
    ]);
    const byId = new Map(categories.map((c) => [c.id, c]));
    return courses.map((c) => toCard(c, byId.get(c.categoryId)));
  }

  /** Decides whether the caller may open this lesson. The video id and text are only built after this passes. */
  async function authoriseLesson(
    userId: string | undefined,
    courseSlug: string,
    lessonSlug: string,
  ) {
    const enrolmentOf = async (course: Course): Promise<Enrolment | null> =>
      userId === undefined ? null : enrolments.find(userId, course.id);
    const probe = await catalogue.findCourseBySlug(courseSlug);
    if (probe === null) throw notFound();
    const enrolment = await enrolmentOf(probe);
    const course = await visibleCourse(courseSlug, enrolment);
    const lessons = await catalogue.listPublishedLessons(course.id);
    const lesson = lessons.find((l) => l.slug === lessonSlug);
    if (lesson === undefined) throw notFound();

    const previewAllowed = lesson.isPreview && course.status === "published";
    if (!previewAllowed && !hasAccess(course, enrolment)) {
      if (userId === undefined) throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");
      if (enrolment === null || enrolment.status === "withdrawn") throw enrolmentRequired();
      throw courseLocked();
    }
    return { course, lessons, lesson, enrolment };
  }

  async function reconcileCompletion(
    course: Course,
    enrolment: Enrolment,
    userId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const [lessons, rows] = await Promise.all([
      catalogue.listPublishedLessons(course.id),
      progress.listForCourse(userId, course.id),
    ]);
    const { progress: summary } = summarise(lessons, rows);
    const complete =
      summary.requiredTotal > 0 && summary.completedRequired === summary.requiredTotal;
    if (complete && enrolment.status === "active") {
      await enrolments.setCompleted(enrolment.id, now());
      await record("course.complete", ctx, userId, course.slug);
    } else if (!complete && enrolment.status === "completed") {
      await enrolments.setCompleted(enrolment.id, undefined);
      await record("course.uncomplete", ctx, userId, course.slug);
    }
  }

  return {
    async catalogue(filter: {
      categorySlug?: string;
      level?: CourseLevel;
      language?: Language;
      tag?: string;
    }) {
      const [categories, courses] = await Promise.all([
        catalogue.listVisibleCategories(),
        catalogue.listPublishedCourses(filter),
      ]);
      return {
        categories: categories.map((c: Category) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
        })),
        courses: await cardsFor(courses),
      };
    },

    async courseDetail(slug: string): Promise<CourseDetailDto> {
      const course = await catalogue.findCourseBySlug(slug);
      if (course === null || course.status !== "published") throw notFound();
      const [cards, sections, lessons, prerequisites] = await Promise.all([
        cardsFor([course]),
        catalogue.listSections(course.id),
        catalogue.listPublishedLessons(course.id),
        catalogue.findCoursesByIds(course.prerequisiteIds),
      ]);
      const card = cards[0] as CourseCardDto;
      return {
        ...card,
        description: course.description,
        outcomes: course.outcomes,
        audience: course.audience,
        prerequisites: prerequisites
          .filter((p) => p.status === "published")
          .map((p) => ({ slug: p.slug, title: p.title })),
        sections: sections
          .map((s) => ({
            title: s.title,
            ...(s.summary === undefined ? {} : { summary: s.summary }),
            lessons: lessons.filter((l) => l.sectionId === s.id).map(toOutlineLesson),
          }))
          .filter((s) => s.lessons.length > 0),
      };
    },

    /** The caller's enrolment for one course, or null. */
    async myEnrolment(userId: string, slug: string): Promise<EnrolmentDto | null> {
      const course = await catalogue.findCourseBySlug(slug);
      if (course === null) return null;
      const enrolment = await enrolments.find(userId, course.id);
      if (enrolment === null || enrolment.status === "withdrawn") return null;
      return enrolmentView(course, enrolment, userId);
    },

    async enrol(userId: string, slug: string, ctx: RequestContext): Promise<EnrolmentDto> {
      const course = await catalogue.findCourseBySlug(slug);
      if (course === null || course.status !== "published") throw notFound();
      const at = now();
      const open = course.unlockPolicy.type === "open";
      const enrolment = await enrolments.enrol({
        userId,
        courseId: course.id,
        access: open ? { state: "unlocked", via: "open", unlockedAt: at } : { state: "locked" },
        now: at,
      });
      // A course that became open after the learner enrolled should not keep them locked out.
      if (open && enrolment.access.state === "locked")
        await enrolments.unlock(enrolment.id, "open", at);
      await record("course.enrol", ctx, userId, course.slug);
      const fresh = (await enrolments.find(userId, course.id)) as Enrolment;
      return enrolmentView(course, fresh, userId);
    },

    async withdraw(userId: string, slug: string, ctx: RequestContext): Promise<void> {
      const course = await catalogue.findCourseBySlug(slug);
      if (course === null) throw notFound();
      const enrolment = await enrolments.find(userId, course.id);
      if (enrolment === null || enrolment.status === "withdrawn") return;
      await enrolments.withdraw(enrolment.id, now());
      await record("course.withdraw", ctx, userId, course.slug);
    },

    async lesson(
      userId: string | undefined,
      courseSlug: string,
      lessonSlug: string,
    ): Promise<LessonDto> {
      const { course, lessons, lesson, enrolment } = await authoriseLesson(
        userId,
        courseSlug,
        lessonSlug,
      );
      const index = lessons.findIndex((l) => l.id === lesson.id);
      const previous = lessons[index - 1];
      const next = lessons[index + 1];
      const row =
        userId === undefined || enrolment === null ? null : await progress.find(userId, lesson.id);
      return {
        ...toOutlineLesson(lesson),
        body: lesson.body,
        ...(lesson.transcript === undefined ? {} : { transcript: lesson.transcript }),
        resources: lesson.resources,
        ...(lesson.video === undefined ? {} : { video: lesson.video }),
        canTrackProgress: userId !== undefined && hasAccess(course, enrolment),
        course: { slug: course.slug, title: course.title },
        position: { index: index + 1, total: lessons.length },
        ...(previous === undefined
          ? {}
          : { previous: { slug: previous.slug, title: previous.title } }),
        ...(next === undefined ? {} : { next: { slug: next.slug, title: next.title } }),
        ...(row === null
          ? {}
          : {
              progress: {
                status: row.status,
                ...(row.positionSec === undefined ? {} : { positionSec: row.positionSec }),
                ...(row.completedAt === undefined
                  ? {}
                  : { completedAt: row.completedAt.toISOString() }),
              },
            }),
      };
    },

    async saveProgress(
      userId: string,
      courseSlug: string,
      lessonSlug: string,
      input: { completed?: boolean | undefined; positionSec?: number | undefined },
      ctx: RequestContext,
    ): Promise<EnrolmentDto> {
      const { course, lesson, enrolment } = await authoriseLesson(userId, courseSlug, lessonSlug);
      // Previews are readable without enrolment, but progress belongs to an enrolment.
      if (
        enrolment === null ||
        enrolment.status === "withdrawn" ||
        enrolment.access.state !== "unlocked"
      )
        throw enrolmentRequired();
      const at = now();
      const duration = lesson.video?.durationSec;
      const position =
        input.positionSec === undefined
          ? undefined
          : duration === undefined
            ? input.positionSec
            : Math.min(input.positionSec, duration);
      await progress.save({
        userId,
        courseId: course.id,
        lessonId: lesson.id,
        ...(input.completed === undefined ? {} : { completed: input.completed }),
        ...(position === undefined ? {} : { positionSec: position }),
        now: at,
      });
      await enrolments.recordActivity(enrolment.id, lesson.id, at);
      await reconcileCompletion(course, enrolment, userId, ctx);
      const fresh = (await enrolments.find(userId, course.id)) as Enrolment;
      return enrolmentView(course, fresh, userId);
    },

    /** "My courses": active and completed enrolments with progress, most recent first. */
    async myLearning(
      userId: string,
    ): Promise<{ course: CourseCardDto; enrolment: EnrolmentDto }[]> {
      const all = (await enrolments.listForUser(userId)).filter((e) => e.status !== "withdrawn");
      const courses = await catalogue.findCoursesByIds(all.map((e) => e.courseId));
      const cards = await cardsFor(courses);
      const out: { course: CourseCardDto; enrolment: EnrolmentDto }[] = [];
      for (const enrolment of all) {
        const course = courses.find((c) => c.id === enrolment.courseId);
        const card = cards.find((c) => c.slug === course?.slug);
        if (course === undefined || card === undefined) continue;
        out.push({ course: card, enrolment: await enrolmentView(course, enrolment, userId) });
      }
      return out;
    },

    /** Learning data for the self-service export: plain facts, readable without our code. */
    async exportLearning(userId: string) {
      const [allEnrolments, rows] = await Promise.all([
        enrolments.listForUser(userId),
        progress.listForUser(userId),
      ]);
      const courses = await catalogue.findCoursesByIds([
        ...new Set([...allEnrolments.map((e) => e.courseId), ...rows.map((r) => r.courseId)]),
      ]);
      const lessonsByCourse = new Map(
        await Promise.all(
          courses.map(async (c) => [c.id, await catalogue.listPublishedLessons(c.id)] as const),
        ),
      );
      const slugOf = (id: string): string =>
        courses.find((c) => c.id === id)?.slug ?? "(removed course)";
      return {
        enrolments: allEnrolments.map((e) => ({
          course: slugOf(e.courseId),
          status: e.status,
          access: e.access.state,
          enrolledAt: e.enrolledAt.toISOString(),
          ...(e.completedAt === undefined ? {} : { completedAt: e.completedAt.toISOString() }),
          ...(e.withdrawnAt === undefined ? {} : { withdrawnAt: e.withdrawnAt.toISOString() }),
        })),
        lessonProgress: rows.map((r) => ({
          course: slugOf(r.courseId),
          lesson:
            lessonsByCourse.get(r.courseId)?.find((l) => l.id === r.lessonId)?.slug ??
            "(retired lesson)",
          status: r.status,
          firstStartedAt: r.firstStartedAt.toISOString(),
          ...(r.completedAt === undefined ? {} : { completedAt: r.completedAt.toISOString() }),
        })),
      };
    },
  };
}

export type CoursesService = ReturnType<typeof createCoursesService>;
