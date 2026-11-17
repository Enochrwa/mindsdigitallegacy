import { paginate } from "../core/page.js";
import type {
  ApplicationRepository,
  PlacementRepository,
  PostingRepository,
} from "../modules/internships/internships.repository.js";
import type {
  Application,
  ApplicationStatus,
  Placement,
  Posting,
  PostingStatus,
} from "../modules/internships/internships.types.js";
import {
  APPLICATION_STATUSES,
  POSTING_STATUSES,
} from "../modules/internships/internships.types.js";

let counter = 0;
const nextId = (prefix: string): string => `${prefix}${String((counter += 1)).padStart(4, "0")}`;
const newest = <T extends { createdAt: Date }>(a: T, b: T): number =>
  b.createdAt.getTime() - a.createdAt.getTime();

export function memoryPostings(): PostingRepository & { all: Posting[] } {
  const all: Posting[] = [];
  return {
    all,
    create(input) {
      const at = new Date();
      const posting: Posting = { ...input, id: nextId("post"), createdAt: at, updatedAt: at };
      all.push(posting);
      return Promise.resolve(posting);
    },
    findById: (id) => Promise.resolve(all.find((p) => p.id === id) ?? null),
    findBySlug: (slug) => Promise.resolve(all.find((p) => p.slug === slug) ?? null),
    slugExists: (slug) => Promise.resolve(all.some((p) => p.slug === slug)),
    update(id, patch, now) {
      const p = all.find((x) => x.id === id);
      if (p === undefined) return Promise.resolve(null);
      Object.assign(p, patch, { updatedAt: now });
      return Promise.resolve(p);
    },
    list(query) {
      const q = query.q?.toLowerCase();
      const rows = all
        .filter((p) => query.status === undefined || p.status === query.status)
        .filter((p) => query.department === undefined || p.department === query.department)
        .filter((p) => q === undefined || p.title.toLowerCase().includes(q))
        .sort(newest);
      return Promise.resolve(paginate(rows, query));
    },
    listPublished: () => Promise.resolve(all.filter((p) => p.status === "published").sort(newest)),
    countByStatus() {
      const out = Object.fromEntries(POSTING_STATUSES.map((s) => [s, 0])) as Record<
        PostingStatus,
        number
      >;
      for (const p of all) out[p.status] += 1;
      return Promise.resolve(out);
    },
  };
}

export function memoryApplications(): ApplicationRepository & { all: Application[] } {
  const all: Application[] = [];
  return {
    all,
    create(input) {
      if (all.some((a) => a.postingId === input.postingId && a.userId === input.userId)) {
        return Promise.reject(new Error("DUPLICATE"));
      }
      const at = new Date();
      const application: Application = {
        ...input,
        id: nextId("app"),
        notes: [],
        createdAt: at,
        updatedAt: at,
      };
      all.push(application);
      return Promise.resolve(application);
    },
    findById: (id) => Promise.resolve(all.find((a) => a.id === id) ?? null),
    findByPostingAndUser: (postingId, userId) =>
      Promise.resolve(all.find((a) => a.postingId === postingId && a.userId === userId) ?? null),
    listByUser: (userId) => Promise.resolve(all.filter((a) => a.userId === userId).sort(newest)),
    list(query) {
      const rows = all
        .filter((a) => query.postingId === undefined || a.postingId === query.postingId)
        .filter((a) => query.status === undefined || a.status === query.status)
        .filter((a) => query.userId === undefined || a.userId === query.userId)
        .sort(newest);
      return Promise.resolve(paginate(rows, query));
    },
    transition(id, from, event, patch) {
      const a = all.find((x) => x.id === id);
      if (a === undefined || a.status !== from) return Promise.resolve(null);
      a.status = event.to;
      a.events.push(event);
      a.updatedAt = event.at;
      if (patch?.messageToApplicant !== undefined) a.messageToApplicant = patch.messageToApplicant;
      if (patch?.agreementAcceptedAt !== undefined)
        a.agreementAcceptedAt = patch.agreementAcceptedAt;
      if (patch?.agreementVersion !== undefined) a.agreementVersion = patch.agreementVersion;
      return Promise.resolve(a);
    },
    patch(id, patch, now) {
      const a = all.find((x) => x.id === id);
      if (a === undefined) return Promise.resolve(null);
      if (patch.guardianVerified !== undefined && a.guardian !== undefined) {
        a.guardian = {
          ...a.guardian,
          verifiedAt: patch.guardianVerified.at,
          verifiedBy: patch.guardianVerified.by,
        };
      }
      if (patch.messageToApplicant !== undefined) a.messageToApplicant = patch.messageToApplicant;
      a.updatedAt = now;
      return Promise.resolve(a);
    },
    addNote(id, note, now) {
      const a = all.find((x) => x.id === id);
      if (a === undefined) return Promise.resolve(null);
      a.notes.push(note);
      a.updatedAt = now;
      return Promise.resolve(a);
    },
    countByStatus(postingId) {
      const out = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
        ApplicationStatus,
        number
      >;
      for (const a of all)
        if (postingId === undefined || a.postingId === postingId) out[a.status] += 1;
      return Promise.resolve(out);
    },
  };
}

export function memoryPlacements(): PlacementRepository & { all: Placement[] } {
  const all: Placement[] = [];
  const active = (p: Placement): boolean => p.status === "active";
  return {
    all,
    create(input) {
      if (all.some((p) => p.applicationId === input.applicationId)) {
        return Promise.reject(new Error("DUPLICATE"));
      }
      const at = new Date();
      const placement: Placement = {
        ...input,
        id: nextId("plc"),
        feedback: [],
        createdAt: at,
        updatedAt: at,
      };
      all.push(placement);
      return Promise.resolve(placement);
    },
    findById: (id) => Promise.resolve(all.find((p) => p.id === id) ?? null),
    findByApplication: (applicationId) =>
      Promise.resolve(all.find((p) => p.applicationId === applicationId) ?? null),
    listByUser: (userId) => Promise.resolve(all.filter((p) => p.userId === userId).sort(newest)),
    listBySupervisor: (id) =>
      Promise.resolve(all.filter((p) => p.supervisorId === id).sort(newest)),
    list(query) {
      const rows = all
        .filter((p) => query.status === undefined || p.status === query.status)
        .filter((p) => query.postingId === undefined || p.postingId === query.postingId)
        .filter((p) => query.supervisorId === undefined || p.supervisorId === query.supervisorId)
        .sort(newest);
      return Promise.resolve(paginate(rows, query));
    },
    countActiveBySupervisor: (id) =>
      Promise.resolve(all.filter((p) => p.supervisorId === id && active(p)).length),
    countActiveByPosting: (id) =>
      Promise.resolve(all.filter((p) => p.postingId === id && active(p)).length),
    activeLoadBySupervisor() {
      const out: Record<string, number> = {};
      for (const p of all) if (active(p)) out[p.supervisorId] = (out[p.supervisorId] ?? 0) + 1;
      return Promise.resolve(out);
    },
    setSupervisor(id, supervisorId, now) {
      const p = all.find((x) => x.id === id);
      if (p === undefined) return Promise.resolve(null);
      p.supervisorId = supervisorId;
      p.updatedAt = now;
      return Promise.resolve(p);
    },
    end(id, status, summary, at) {
      const p = all.find((x) => x.id === id);
      if (p === undefined || !active(p)) return Promise.resolve(null);
      p.status = status;
      p.outcomeSummary = summary;
      p.endedAt = at;
      p.updatedAt = at;
      return Promise.resolve(p);
    },
    addFeedback(id, feedback, now) {
      const p = all.find((x) => x.id === id);
      if (p === undefined) return Promise.resolve(null);
      p.feedback.push(feedback);
      p.updatedAt = now;
      return Promise.resolve(p);
    },
  };
}

/** The three internship repositories, in memory, for tests and the dev server. */
export function memoryInternshipDeps() {
  return {
    internshipPostings: memoryPostings(),
    internshipApplications: memoryApplications(),
    internshipPlacements: memoryPlacements(),
  };
}
