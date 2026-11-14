import { randomUUID } from "node:crypto";
import { paginate } from "../core/page.js";
import { SlugTakenError } from "../modules/courses/courses.admin.js";
import type { CatalogueAdminRepository } from "../modules/courses/courses.admin.js";
import { computeCourseStats } from "../modules/courses/courses.types.js";
import type {
  Category,
  Course,
  CourseStatus,
  Lesson,
  Section,
} from "../modules/courses/courses.types.js";
import type { CatalogueData } from "./memory.js";
import type { LeadAdminRepository, LeadListQuery } from "../modules/leads/leads.admin.js";
import type { Lead, LeadStatus } from "../modules/leads/leads.model.js";
import type { LeadRepository } from "../modules/leads/leads.repository.js";
import type {
  Entitlement,
  EntitlementRepository,
  RedeemOutcome,
  UnlockCode,
  UnlockCodeRepository,
} from "../modules/access/access.types.js";
import type {
  FunnelCounts,
  ReferralRepository,
} from "../modules/referrals/referrals.repository.js";
import type {
  Referral,
  ReferralCode,
  ReferralEvent,
  ReferralStatus,
} from "../modules/referrals/referrals.types.js";
import { DEFAULT_SETTINGS } from "../modules/settings/settings.js";
import type { SettingsRepository, StoredSettings } from "../modules/settings/settings.js";

/** In-memory fakes for referrals, access and settings. Same contracts as the Mongo repositories. */

export function memorySettings(): SettingsRepository & { current: StoredSettings } {
  const state = {
    current: { settings: structuredClone(DEFAULT_SETTINGS), version: 0 } as StoredSettings,
  };
  return {
    get current() {
      return state.current;
    },
    get: () => Promise.resolve(structuredClone(state.current)),
    save(settings, expectedVersion, by, at) {
      if (state.current.version !== expectedVersion) return Promise.resolve(false);
      state.current = {
        settings: structuredClone(settings),
        version: expectedVersion + 1,
        updatedAt: at,
        updatedBy: by,
      };
      return Promise.resolve(true);
    },
  };
}

export function memoryEntitlements(): EntitlementRepository & { all: Entitlement[] } {
  const all: Entitlement[] = [];
  const sameScope = (a: Entitlement["scope"], b: Entitlement["scope"]): boolean =>
    a.type === b.type && (a.type === "all" || (b.type === "course" && a.courseId === b.courseId));
  return {
    all,
    grant(input) {
      const existing = all.find(
        (e) =>
          e.userId === input.userId &&
          e.via === input.via &&
          e.sourceId === input.sourceId &&
          e.revokedAt === undefined &&
          sameScope(e.scope, input.scope),
      );
      if (existing) return Promise.resolve({ entitlement: existing, created: false });
      const entitlement: Entitlement = { ...input, id: randomUUID() };
      all.push(entitlement);
      return Promise.resolve({ entitlement, created: true });
    },
    listForUser: (userId) =>
      Promise.resolve(
        all
          .filter((e) => e.userId === userId)
          .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime()),
      ),
    revoke(id, at, by) {
      const e = all.find((x) => x.id === id);
      if (e && e.revokedAt === undefined) Object.assign(e, { revokedAt: at, revokedBy: by });
      return Promise.resolve();
    },
    findById: (id) => Promise.resolve(all.find((e) => e.id === id) ?? null),
  };
}

export function memoryUnlockCodes(): UnlockCodeRepository & { all: UnlockCode[] } {
  const all: UnlockCode[] = [];
  const redemptions: { codeId: string; userId: string; at: Date }[] = [];
  return {
    all,
    create({ now, ...rest }) {
      if (all.some((c) => c.code === rest.code.toUpperCase()))
        return Promise.reject(new Error("CODE_TAKEN"));
      const code: UnlockCode = {
        ...rest,
        code: rest.code.toUpperCase(),
        id: randomUUID(),
        usedCount: 0,
        createdAt: now,
      };
      all.push(code);
      return Promise.resolve(code);
    },
    findByCode: (code) => Promise.resolve(all.find((c) => c.code === code.toUpperCase()) ?? null),
    findById: (id) => Promise.resolve(all.find((c) => c.id === id) ?? null),
    list({ page, pageSize, q }) {
      const rows = all
        .filter((c) => !q || c.code.startsWith(q.toUpperCase()))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return Promise.resolve(paginate(rows, { page, pageSize }));
    },
    update(id, patch) {
      const c = all.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
      return Promise.resolve();
    },
    redeem(codeId, userId, now): Promise<RedeemOutcome> {
      const c = all.find((x) => x.id === codeId);
      if (!c || c.status !== "active") return Promise.resolve("inactive");
      if (c.expiresAt && c.expiresAt <= now) return Promise.resolve("expired");
      if (redemptions.some((r) => r.codeId === codeId && r.userId === userId))
        return Promise.resolve("already");
      if (c.maxUses !== null && c.usedCount >= c.maxUses) return Promise.resolve("exhausted");
      redemptions.push({ codeId, userId, at: now });
      c.usedCount += 1;
      return Promise.resolve("ok");
    },
    listRedemptions: (codeId) =>
      Promise.resolve(
        redemptions.filter((r) => r.codeId === codeId).map(({ userId, at }) => ({ userId, at })),
      ),
  };
}

export function memoryReferrals(): ReferralRepository & {
  codes: ReferralCode[];
  referrals: Referral[];
  events: ReferralEvent[];
} {
  const codes: ReferralCode[] = [];
  const referrals: Referral[] = [];
  const events: ReferralEvent[] = [];
  return {
    codes,
    referrals,
    events,
    findCodeByUser: (userId) => Promise.resolve(codes.find((c) => c.userId === userId) ?? null),
    findCode: (code) => Promise.resolve(codes.find((c) => c.code === code.toUpperCase()) ?? null),
    createCode({ userId, code, assignedThreshold, now }) {
      const existing = codes.find((c) => c.userId === userId);
      if (existing) return Promise.resolve(existing);
      if (codes.some((c) => c.code === code.toUpperCase()))
        return Promise.reject(new Error("CODE_TAKEN"));
      const row: ReferralCode = {
        id: randomUUID(),
        userId,
        code: code.toUpperCase(),
        status: "active",
        assignedThreshold,
        createdAt: now,
      };
      codes.push(row);
      return Promise.resolve(row);
    },
    setCodeStatus(id, status) {
      const c = codes.find((x) => x.id === id);
      if (c) c.status = status;
      return Promise.resolve();
    },
    listCodes: ({ q, page, pageSize }) =>
      Promise.resolve(
        paginate(
          codes
            .filter((c) => !q || c.code.startsWith(q.toUpperCase()))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          { page, pageSize },
        ),
      ),
    findByInvitee: (id) => Promise.resolve(referrals.find((r) => r.inviteeId === id) ?? null),
    findById: (id) => Promise.resolve(referrals.find((r) => r.id === id) ?? null),
    create(input) {
      const existing = referrals.find((r) => r.inviteeId === input.inviteeId);
      if (existing) return Promise.resolve(existing);
      const row: Referral = { ...input, id: randomUUID() };
      referrals.push(row);
      return Promise.resolve(row);
    },
    update(id, patch) {
      const r = referrals.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      return Promise.resolve();
    },
    list({ status, reason, referrerId, page, pageSize }) {
      const rows = referrals
        .filter(
          (r) =>
            (!status || r.status === status) &&
            (!reason || r.reason === reason) &&
            (!referrerId || r.referrerId === referrerId),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return Promise.resolve(paginate(rows, { page, pageSize }));
    },
    countByStatus(referrerId) {
      const out: Record<ReferralStatus, number> = {
        pending: 0,
        qualified: 0,
        needs_review: 0,
        rejected: 0,
        revoked: 0,
      };
      for (const r of referrals) if (r.referrerId === referrerId) out[r.status] += 1;
      return Promise.resolve(out);
    },
    countQualifiedFromNetwork: (referrerId, ip) =>
      Promise.resolve(
        referrals.filter(
          (r) => r.referrerId === referrerId && r.ipPrefix === ip && r.status === "qualified",
        ).length,
      ),
    countCreatedSince: (code, since) =>
      Promise.resolve(referrals.filter((r) => r.code === code && r.createdAt >= since).length),
    existsOtherWithEmailKey: (key, except) =>
      Promise.resolve(referrals.some((r) => r.emailKey === key && r.inviteeId !== except)),
    appendEvent(e) {
      events.push(e);
      return Promise.resolve();
    },
    funnel(since) {
      const out: FunnelCounts = { byType: {}, byVariant: {} };
      for (const e of events.filter((x) => x.at >= since)) {
        out.byType[e.type] = (out.byType[e.type] ?? 0) + 1;
        const key = e.variant === undefined ? "default" : String(e.variant);
        const bucket = (out.byVariant[key] ??= {});
        bucket[e.type] = (bucket[e.type] ?? 0) + 1;
      }
      return Promise.resolve(out);
    },
    eventsByDay(since, type) {
      const counts = new Map<string, number>();
      for (const e of events)
        if (e.type === type && e.at >= since)
          counts.set(
            e.at.toISOString().slice(0, 10),
            (counts.get(e.at.toISOString().slice(0, 10)) ?? 0) + 1,
          );
      return Promise.resolve([...counts].sort().map(([day, count]) => ({ day, count })));
    },
  };
}

export function memoryLeads(): LeadRepository & LeadAdminRepository & { rows: Lead[] } {
  const rows: Lead[] = [];
  const matches = (l: Lead, q: Omit<LeadListQuery, "page" | "pageSize">): boolean => {
    const needle = q.q?.trim().toLowerCase();
    return (
      (!q.kind || l.kind === q.kind) &&
      (!q.status || l.status === q.status) &&
      (!q.priority || l.priority === q.priority) &&
      (!q.tag || l.tags.includes(q.tag)) &&
      (!q.assignedTo ||
        (q.assignedTo === "unassigned"
          ? l.assignedTo === undefined
          : l.assignedTo === q.assignedTo)) &&
      (!q.from || l.createdAt >= q.from) &&
      (!q.to || l.createdAt <= q.to) &&
      (!q.overdue ||
        (l.followUpAt !== undefined &&
          l.followUpAt <= (q.now ?? new Date()) &&
          ["new", "contacted", "qualified"].includes(l.status))) &&
      (!needle ||
        l.email.startsWith(needle) ||
        l.fullName.toLowerCase().includes(needle) ||
        (l.organization ?? "").toLowerCase().includes(needle))
    );
  };
  const sorted = (list: Lead[], s: LeadListQuery["sort"]): Lead[] =>
    [...list].sort((a, b) =>
      s === "oldest"
        ? a.createdAt.getTime() - b.createdAt.getTime()
        : s === "followUp"
          ? (a.followUpAt?.getTime() ?? Infinity) - (b.followUpAt?.getTime() ?? Infinity)
          : b.createdAt.getTime() - a.createdAt.getTime(),
    );
  return {
    rows,
    create(lead) {
      rows.push({
        ...lead,
        id: randomUUID(),
        status: "new",
        priority: "normal",
        tags: [],
        notes: [],
        createdAt: new Date(),
      });
      return Promise.resolve();
    },
    list: (q) =>
      Promise.resolve(
        paginate(
          sorted(
            rows.filter((l) => matches(l, q)),
            q.sort,
          ),
          q,
        ),
      ),
    findById: (id) => Promise.resolve(rows.find((l) => l.id === id) ?? null),
    update(id, patch, at) {
      const l = rows.find((x) => x.id === id);
      if (!l) return Promise.resolve(null);
      if (patch.status !== undefined) {
        l.status = patch.status;
        l.statusChangedAt = at;
      }
      if (patch.priority !== undefined) l.priority = patch.priority;
      if (patch.tags !== undefined) l.tags = patch.tags;
      if ("assignedTo" in patch) l.assignedTo = patch.assignedTo ?? undefined;
      if ("followUpAt" in patch) l.followUpAt = patch.followUpAt ?? undefined;
      return Promise.resolve(l);
    },
    addNote(id, by, text, at) {
      const l = rows.find((x) => x.id === id);
      if (!l) return Promise.resolve(null);
      const note = { id: randomUUID(), at, by, text };
      l.notes.push(note);
      return Promise.resolve(note);
    },
    remove(id) {
      const i = rows.findIndex((l) => l.id === id);
      if (i >= 0) rows.splice(i, 1);
      return Promise.resolve(i >= 0);
    },
    countByStatus() {
      const out: Record<LeadStatus, number> = {
        new: 0,
        contacted: 0,
        qualified: 0,
        converted: 0,
        closed: 0,
        spam: 0,
      };
      for (const l of rows) out[l.status] += 1;
      return Promise.resolve(out);
    },
    countByKind() {
      const out: Record<string, number> = {};
      for (const l of rows) out[l.kind] = (out[l.kind] ?? 0) + 1;
      return Promise.resolve(out);
    },
    byDay(since) {
      const m = new Map<string, number>();
      for (const l of rows)
        if (l.createdAt >= since)
          m.set(
            l.createdAt.toISOString().slice(0, 10),
            (m.get(l.createdAt.toISOString().slice(0, 10)) ?? 0) + 1,
          );
      return Promise.resolve([...m].sort().map(([day, count]) => ({ day, count })));
    },
    overdueCount: (now) =>
      Promise.resolve(
        rows.filter(
          (l) =>
            l.followUpAt !== undefined &&
            l.followUpAt <= now &&
            ["new", "contacted", "qualified"].includes(l.status),
        ).length,
      ),
    exportRows: (q, limit) =>
      Promise.resolve(
        sorted(
          rows.filter((l) => matches(l, q)),
          q.sort,
        ).slice(0, limit),
      ),
  };
}

/** Admin write side over the same in-memory data the read repository uses. */
export function memoryCatalogueAdmin(
  data: CatalogueData,
  now: () => Date = () => new Date(),
): CatalogueAdminRepository {
  const touch = (courseId: string, at: Date): void => {
    const c = data.courses.find((x) => x.id === courseId);
    if (!c) return;
    c.stats = computeCourseStats(data.lessons.filter((l) => l.courseId === courseId));
    c.source = "admin";
    c.contentVersion += 1;
    c.updatedAt = at;
  };
  // Rejected (not thrown) so callers see the same async failure the Mongo adapter produces.
  const slugTaken = (): Promise<never> => Promise.reject(new SlugTakenError());
  void now;
  return {
    listCategories: () => Promise.resolve([...data.categories].sort((a, b) => a.order - b.order)),
    saveCategory(input) {
      if (data.categories.some((c) => c.slug === input.slug && c.id !== input.id))
        return slugTaken();
      if (input.id === undefined) {
        const c: Category = {
          id: randomUUID(),
          slug: input.slug,
          name: input.name,
          description: input.description,
          order: input.order,
          visible: input.visible,
        };
        data.categories.push(c);
        return Promise.resolve(c);
      }
      const c = data.categories.find((x) => x.id === input.id);
      if (!c) return Promise.resolve(null);
      Object.assign(c, {
        slug: input.slug,
        name: input.name,
        description: input.description,
        order: input.order,
        visible: input.visible,
      });
      return Promise.resolve(c);
    },
    listCourses({ q, status, categoryId, page, pageSize }) {
      const needle = q?.trim().toLowerCase();
      const rows = data.courses
        .filter(
          (c) =>
            (!status || c.status === status) &&
            (!categoryId || c.categoryId === categoryId) &&
            (!needle || c.title.toLowerCase().includes(needle) || c.slug.startsWith(needle)),
        )
        .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
      return Promise.resolve(paginate(rows, { page, pageSize }));
    },
    findCourseById: (id) => Promise.resolve(data.courses.find((c) => c.id === id) ?? null),
    createCourse(input, at) {
      if (data.courses.some((c) => c.slug === input.slug)) return slugTaken();
      const c: Course = {
        ...input,
        id: randomUUID(),
        status: "draft",
        stats: { lessonCount: 0, requiredLessonCount: 0, totalDurationSec: 0 },
        contentVersion: 1,
        source: "admin",
        createdAt: at,
        updatedAt: at,
      };
      data.courses.push(c);
      return Promise.resolve(c);
    },
    updateCourse(id, patch, at) {
      const c = data.courses.find((x) => x.id === id);
      if (!c) return Promise.resolve(null);
      if (patch.slug && data.courses.some((x) => x.slug === patch.slug && x.id !== id))
        return slugTaken();
      Object.assign(c, patch);
      touch(id, at);
      return Promise.resolve(c);
    },
    setCourseStatus(id, status, at) {
      const c = data.courses.find((x) => x.id === id);
      if (!c) return Promise.resolve(null);
      c.status = status;
      if (status === "published") c.publishedAt = at;
      if (status === "archived") c.archivedAt = at;
      touch(id, at);
      return Promise.resolve(c);
    },
    listAllLessons: (courseId) =>
      Promise.resolve(
        data.lessons.filter((l) => l.courseId === courseId).sort((a, b) => a.order - b.order),
      ),
    findLessonById: (id) => Promise.resolve(data.lessons.find((l) => l.id === id) ?? null),
    createSection(courseId, title, summary, at) {
      if (!data.courses.some((c) => c.id === courseId)) return Promise.resolve(null);
      const order =
        Math.max(0, ...data.sections.filter((s) => s.courseId === courseId).map((s) => s.order)) +
        1;
      const s: Section = { id: randomUUID(), courseId, order, title, summary };
      data.sections.push(s);
      touch(courseId, at);
      return Promise.resolve(s);
    },
    updateSection(id, patch, at) {
      const s = data.sections.find((x) => x.id === id);
      if (!s) return Promise.resolve(null);
      if (patch.title !== undefined) s.title = patch.title;
      if (patch.summary !== undefined) s.summary = patch.summary ?? undefined;
      touch(s.courseId, at);
      return Promise.resolve(s);
    },
    deleteSection(id, at) {
      const i = data.sections.findIndex((x) => x.id === id);
      if (i < 0) return Promise.resolve("not_found");
      if (data.lessons.some((l) => l.sectionId === id)) return Promise.resolve("not_empty");
      const [removed] = data.sections.splice(i, 1);
      if (removed) touch(removed.courseId, at);
      return Promise.resolve("ok");
    },
    createLesson(courseId, input, at) {
      if (!data.courses.some((c) => c.id === courseId)) return Promise.resolve(null);
      if (data.lessons.some((l) => l.courseId === courseId && l.slug === input.slug))
        return slugTaken();
      const order =
        Math.max(0, ...data.lessons.filter((l) => l.courseId === courseId).map((l) => l.order)) + 1;
      const l: Lesson = {
        ...input,
        id: randomUUID(),
        courseId,
        order,
        status: "draft",
        createdAt: at,
        updatedAt: at,
      };
      data.lessons.push(l);
      touch(courseId, at);
      return Promise.resolve(l);
    },
    updateLesson(id, patch, at) {
      const l = data.lessons.find((x) => x.id === id);
      if (!l) return Promise.resolve(null);
      if (
        patch.slug &&
        data.lessons.some((x) => x.courseId === l.courseId && x.slug === patch.slug && x.id !== id)
      )
        return slugTaken();
      Object.assign(l, patch);
      if ("video" in patch && patch.video === undefined) delete l.video;
      if ("transcript" in patch && patch.transcript === undefined) delete l.transcript;
      l.updatedAt = at;
      touch(l.courseId, at);
      return Promise.resolve(l);
    },
    setLessonStatus(id, status, at) {
      const l = data.lessons.find((x) => x.id === id);
      if (!l) return Promise.resolve(null);
      l.status = status;
      touch(l.courseId, at);
      return Promise.resolve(l);
    },
    reorderLessons(courseId, layout, at) {
      const mine = data.lessons.filter((l) => l.courseId === courseId);
      if (
        layout.length !== mine.length ||
        !layout.every((x) => mine.some((l) => l.id === x.lessonId))
      )
        return Promise.resolve(false);
      layout.forEach((x, i) => {
        const l = mine.find((m) => m.id === x.lessonId);
        if (l) Object.assign(l, { order: i + 1, sectionId: x.sectionId });
      });
      touch(courseId, at);
      return Promise.resolve(true);
    },
    countCourses() {
      const out: Record<CourseStatus, number> = { draft: 0, published: 0, archived: 0 };
      for (const c of data.courses) out[c.status] += 1;
      return Promise.resolve(out);
    },
  };
}

/** Everything the growth and admin features need, over one shared in-memory catalogue. */
export function memoryGrowthDeps(data: CatalogueData) {
  const leads = memoryLeads();
  return {
    leads,
    catalogueAdmin: memoryCatalogueAdmin(data),
    referrals: memoryReferrals(),
    entitlements: memoryEntitlements(),
    unlockCodes: memoryUnlockCodes(),
    settings: memorySettings(),
  };
}
