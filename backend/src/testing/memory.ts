import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditLog } from "../modules/audit/audit.js";
import type { AuthTokenRepository, TokenPurpose } from "../modules/auth/authTokens.js";
import type { Mailer } from "../modules/auth/mailer.js";
import type { NewSession, Session, SessionRepository } from "../modules/sessions/sessions.types.js";
import type { UserRepository } from "../modules/users/users.repository.js";
import { DuplicateEmailError } from "../modules/users/users.types.js";
import type { ConsentType, NewUser, User } from "../modules/users/users.types.js";
import type {
  CatalogueRepository,
  EnrolmentRepository,
  ProgressRepository,
} from "../modules/courses/courses.repository.js";
import type { PreparedContent } from "../modules/courses/content.validate.js";
import type {
  Category,
  Course,
  Enrolment,
  Lesson,
  LessonProgress,
  Section,
} from "../modules/courses/courses.types.js";

/** In-memory fakes for HTTP tests. Behaviour mirrors the Mongo repositories' contracts. */

export function memoryUsers(): UserRepository & { all: Map<string, User> } {
  const all = new Map<string, User>();
  const get = (id: string): User => {
    const user = all.get(id);
    if (user === undefined) throw new Error("no such user");
    return user;
  };
  return {
    all,
    create(input: NewUser) {
      if ([...all.values()].some((u) => u.email === input.email)) {
        return Promise.reject(new DuplicateEmailError());
      }
      const user: User = { ...input, id: randomUUID(), createdAt: new Date(), failedLogins: 0 };
      all.set(user.id, user);
      return Promise.resolve(user);
    },
    findByEmail: (email) =>
      Promise.resolve([...all.values()].find((u) => u.email === email) ?? null),
    findById: (id) => Promise.resolve(all.get(id) ?? null),
    markEmailVerified(id, at) {
      get(id).emailVerifiedAt = at;
      return Promise.resolve();
    },
    recordGuardianConsent(id, at, method) {
      const user = get(id);
      if (user.guardian) user.guardian = { ...user.guardian, consentAt: at, method };
      return Promise.resolve();
    },
    setPasswordHash(id, hash) {
      get(id).passwordHash = hash;
      return Promise.resolve();
    },
    incrementFailedLogins(id) {
      const user = get(id);
      user.failedLogins += 1;
      return Promise.resolve(user.failedLogins);
    },
    lockUntil(id, until) {
      get(id).lockedUntil = until;
      return Promise.resolve();
    },
    clearLoginState(id) {
      const user = get(id);
      user.failedLogins = 0;
      user.lockedUntil = undefined;
      return Promise.resolve();
    },
    setConsent(id, type: ConsentType, noticeVersion, at, granted) {
      const user = get(id);
      if (granted) user.consents.push({ type, noticeVersion, at });
      else
        for (const c of user.consents)
          if (c.type === type && c.withdrawnAt === undefined) c.withdrawnAt = at;
      return Promise.resolve();
    },
    softDelete(id, at) {
      get(id).deletedAt = at;
      return Promise.resolve();
    },
  };
}

export function memorySessions(): SessionRepository & { all: Map<string, Session> } {
  const all = new Map<string, Session>();
  return {
    all,
    create(input: NewSession) {
      const session: Session = { ...input, id: randomUUID() };
      all.set(session.id, session);
      return Promise.resolve(session);
    },
    findByTokenHash: (hash) =>
      Promise.resolve([...all.values()].find((s) => s.tokenHash === hash) ?? null),
    markRotated(id, at) {
      const s = all.get(id);
      if (s) s.rotatedAt = at;
      return Promise.resolve();
    },
    touch(id, lastUsedAt, expiresAt) {
      const s = all.get(id);
      if (s) Object.assign(s, { lastUsedAt, expiresAt });
      return Promise.resolve();
    },
    revokeFamily(family) {
      for (const [id, s] of all) if (s.family === family) all.delete(id);
      return Promise.resolve();
    },
    revokeAllForUser(userId, exceptFamily) {
      for (const [id, s] of all)
        if (s.userId === userId && s.family !== exceptFamily) all.delete(id);
      return Promise.resolve();
    },
  };
}

export function memoryAuthTokens(): AuthTokenRepository {
  const rows: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }[] = [];
  const find = (purpose: TokenPurpose, tokenHash: string, now: Date) =>
    rows.find(
      (r) =>
        r.purpose === purpose &&
        r.tokenHash === tokenHash &&
        r.usedAt === undefined &&
        r.expiresAt > now,
    );
  return {
    create(input) {
      rows.push({ ...input });
      return Promise.resolve();
    },
    peek: (purpose, hash, now) => Promise.resolve(find(purpose, hash, now)?.userId ?? null),
    consume(purpose, hash, now) {
      const row = find(purpose, hash, now);
      if (row === undefined) return Promise.resolve(null);
      row.usedAt = now;
      return Promise.resolve(row.userId);
    },
  };
}

export function memoryAudit(): AuditLog & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    append(event) {
      events.push(event);
      return Promise.resolve();
    },
  };
}

export interface SentMail {
  kind: "verify" | "reset" | "guardian" | "existing";
  to: string;
  token?: string;
}

export function memoryMailer(): Mailer & { sent: SentMail[] } {
  const sent: SentMail[] = [];
  return {
    sent,
    sendVerification(to, token) {
      sent.push({ kind: "verify", to, token });
      return Promise.resolve();
    },
    sendPasswordReset(to, token) {
      sent.push({ kind: "reset", to, token });
      return Promise.resolve();
    },
    sendGuardianConsent(to, _name, token) {
      sent.push({ kind: "guardian", to, token });
      return Promise.resolve();
    },
    sendExistingAccountNotice(to) {
      sent.push({ kind: "existing", to });
      return Promise.resolve();
    },
  };
}

/* ---------- Academy ---------- */

export interface CatalogueData {
  categories: Category[];
  courses: Course[];
  sections: Section[];
  lessons: Lesson[];
}

/** Turns validated content into plain records with generated ids, the same shape the Mongo repositories return. */
export function buildCatalogueData(
  prepared: PreparedContent,
  now: Date = new Date(),
): CatalogueData {
  const data: CatalogueData = { categories: [], courses: [], sections: [], lessons: [] };
  const categoryId = new Map<string, string>();
  for (const c of prepared.categories) {
    const id = `cat-${c.slug}`;
    categoryId.set(c.slug, id);
    data.categories.push({
      id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      order: c.order,
      visible: c.visible,
    });
  }
  const courseId = new Map(
    prepared.courses.map((c) => [c.content.slug, `course-${c.content.slug}`]),
  );
  for (const course of prepared.courses) {
    const c = course.content;
    const id = courseId.get(c.slug) as string;
    data.courses.push({
      id,
      slug: c.slug,
      categoryId: categoryId.get(c.categorySlug) as string,
      title: c.title,
      summary: c.summary,
      description: c.description,
      level: c.level,
      language: c.language,
      status: c.status,
      order: c.order,
      tags: c.tags,
      outcomes: c.outcomes,
      audience: c.audience,
      prerequisiteIds: c.prerequisites.map((p) => courseId.get(p) as string),
      instructors: c.instructors,
      unlockPolicy: c.unlockPolicy,
      stats: course.stats,
      contentVersion: 1,
      publishedAt: c.status === "published" ? now : undefined,
      archivedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
    for (const section of course.sections) {
      const sectionId = `${id}-s${section.order}`;
      data.sections.push({
        id: sectionId,
        courseId: id,
        order: section.order,
        title: section.title,
        summary: section.summary,
      });
      for (const l of section.lessons) {
        data.lessons.push({
          id: `${id}-${l.slug}`,
          courseId: id,
          sectionId,
          order: l.order,
          slug: l.slug,
          title: l.title,
          summary: l.summary,
          kind: l.kind,
          status: l.status,
          required: l.required,
          isPreview: l.isPreview,
          video: l.video,
          body: l.body,
          transcript: l.transcript,
          resources: l.resources,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
  return data;
}

export function memoryCatalogue(
  data: CatalogueData,
): CatalogueRepository & { data: CatalogueData } {
  const byOrder = <T extends { order: number }>(a: T, b: T): number => a.order - b.order;
  return {
    data,
    listVisibleCategories: () =>
      Promise.resolve(data.categories.filter((c) => c.visible).sort(byOrder)),
    listPublishedCourses(filter) {
      const category =
        filter.categorySlug === undefined
          ? undefined
          : data.categories.find((c) => c.slug === filter.categorySlug && c.visible);
      if (filter.categorySlug !== undefined && category === undefined) return Promise.resolve([]);
      return Promise.resolve(
        data.courses
          .filter((c) => c.status === "published")
          .filter((c) => category === undefined || c.categoryId === category.id)
          .filter((c) => filter.level === undefined || c.level === filter.level)
          .filter((c) => filter.language === undefined || c.language === filter.language)
          .filter((c) => filter.tag === undefined || c.tags.includes(filter.tag))
          .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)),
      );
    },
    findCourseBySlug: (slug) =>
      Promise.resolve(data.courses.find((c) => c.slug === slug && c.status !== "draft") ?? null),
    findCoursesByIds: (ids) => Promise.resolve(data.courses.filter((c) => ids.includes(c.id))),
    findCategoriesByIds: (ids) =>
      Promise.resolve(data.categories.filter((c) => ids.includes(c.id))),
    listSections: (courseId) =>
      Promise.resolve(data.sections.filter((s) => s.courseId === courseId).sort(byOrder)),
    listPublishedLessons: (courseId) =>
      Promise.resolve(
        data.lessons
          .filter((l) => l.courseId === courseId && l.status === "published")
          .sort(byOrder),
      ),
  };
}

export function memoryEnrolments(): EnrolmentRepository & { all: Map<string, Enrolment> } {
  const all = new Map<string, Enrolment>();
  const key = (u: string, c: string): string => `${u}|${c}`;
  const byId = (id: string): Enrolment => {
    const e = [...all.values()].find((x) => x.id === id);
    if (e === undefined) throw new Error("no such enrolment");
    return e;
  };
  return {
    all,
    find: (u, c) => Promise.resolve(all.get(key(u, c)) ?? null),
    listForUser: (u) =>
      Promise.resolve(
        [...all.values()]
          .filter((e) => e.userId === u)
          .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()),
      ),
    enrol({ userId, courseId, access, now }) {
      const existing = all.get(key(userId, courseId));
      if (existing !== undefined) {
        if (existing.status === "withdrawn")
          Object.assign(existing, {
            status: "active",
            withdrawnAt: undefined,
            lastActivityAt: now,
          });
        return Promise.resolve(existing);
      }
      const created: Enrolment = {
        id: randomUUID(),
        userId,
        courseId,
        status: "active",
        access,
        enrolledAt: now,
        lastActivityAt: now,
      };
      all.set(key(userId, courseId), created);
      return Promise.resolve(created);
    },
    withdraw(id, at) {
      Object.assign(byId(id), { status: "withdrawn", withdrawnAt: at });
      return Promise.resolve();
    },
    recordActivity(id, lessonId, at) {
      Object.assign(byId(id), { lastLessonId: lessonId, lastActivityAt: at });
      return Promise.resolve();
    },
    setCompleted(id, completedAt) {
      const e = byId(id);
      if (completedAt === undefined) {
        if (e.status === "completed")
          Object.assign(e, { status: "active", completedAt: undefined });
      } else if (e.status === "active") Object.assign(e, { status: "completed", completedAt });
      return Promise.resolve();
    },
    unlock(id, via, at) {
      byId(id).access = { state: "unlocked", via, unlockedAt: at };
      return Promise.resolve();
    },
  };
}

export function memoryProgress(): ProgressRepository & { all: LessonProgress[] } {
  const all: LessonProgress[] = [];
  return {
    all,
    find: (u, l) => Promise.resolve(all.find((p) => p.userId === u && p.lessonId === l) ?? null),
    listForCourse: (u, c) => Promise.resolve(all.filter((p) => p.userId === u && p.courseId === c)),
    listForUser: (u) => Promise.resolve(all.filter((p) => p.userId === u)),
    save({ userId, courseId, lessonId, completed, positionSec, now }) {
      let row = all.find((p) => p.userId === userId && p.lessonId === lessonId);
      if (row === undefined) {
        row = {
          id: randomUUID(),
          userId,
          courseId,
          lessonId,
          status: "in_progress",
          firstStartedAt: now,
          lastActivityAt: now,
        };
        all.push(row);
      }
      row.lastActivityAt = now;
      if (positionSec !== undefined) row.positionSec = positionSec;
      if (completed === true) {
        row.status = "completed";
        row.completedAt ??= now;
      } else if (completed === false) {
        row.status = "in_progress";
        row.completedAt = undefined;
      }
      return Promise.resolve(row);
    },
  };
}
