import { Types, trusted } from "mongoose";
import { escapeRegex } from "../../core/page.js";
import type {
  ApplicationRepository,
  PlacementRepository,
  PostingRepository,
} from "./internships.repository.js";
import { ApplicationModel, PlacementModel, PostingModel } from "./internships.model.js";
import { APPLICATION_STATUSES, POSTING_STATUSES } from "./internships.types.js";
import type {
  Application,
  ApplicationStatus,
  Placement,
  Posting,
  PostingStatus,
  SupervisorFeedback,
} from "./internships.types.js";

const id = (v: unknown): string => String(v);
const oid = (v: string): Types.ObjectId => new Types.ObjectId(v);
const isDup = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && e.code === 11000;
/** An id that is not a valid ObjectId can never match a row, so it is a plain "not found". */
const valid = (v: string): boolean => Types.ObjectId.isValid(v);

// ---------------------------------------------------------------- mappers
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- lean documents are loosely typed; these mappers pick every field explicitly and are covered by the integration tests */
const toPosting = (d: any): Posting => ({
  id: id(d._id),
  slug: d.slug,
  title: d.title,
  department: d.department,
  summary: d.summary,
  description: d.description,
  requirements: d.requirements ?? [],
  learningGoals: d.learningGoals ?? [],
  mode: d.mode,
  location: d.location,
  durationWeeks: d.durationWeeks,
  hoursPerWeek: d.hoursPerWeek,
  compensation: d.compensation,
  compensationNote: d.compensationNote ?? "",
  minAge: d.minAge,
  slots: d.slots,
  skills: d.skills ?? [],
  responsibilities: d.responsibilities ?? [],
  whoCanApply: d.whoCanApply ?? [],
  perks: d.perks ?? [],
  startsOn: d.startsOn ?? undefined,
  screeningQuestions: (d.screeningQuestions ?? []).map((q: any) => ({
    id: q.id,
    label: q.label,
    kind: q.kind,
    required: q.required,
    options: q.options ?? undefined,
  })),
  supervisorIds: (d.supervisorIds ?? []).map(id),
  status: d.status,
  opensAt: d.opensAt ?? undefined,
  closesAt: d.closesAt ?? undefined,
  publishedAt: d.publishedAt ?? undefined,
  createdBy: id(d.createdBy),
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const toApplication = (d: any): Application => ({
  id: id(d._id),
  postingId: id(d.postingId),
  userId: id(d.userId),
  statement: d.statement,
  links: d.links ?? [],
  availableFrom: d.availableFrom ?? undefined,
  under18: d.under18,
  guardian:
    d.guardian === null || d.guardian === undefined
      ? undefined
      : {
          name: d.guardian.name,
          relationship: d.guardian.relationship,
          contact: d.guardian.contact,
          verifiedAt: d.guardian.verifiedAt ?? undefined,
          verifiedBy:
            d.guardian.verifiedBy === null || d.guardian.verifiedBy === undefined
              ? undefined
              : id(d.guardian.verifiedBy),
        },
  status: d.status,
  events: (d.events ?? []).map((e: any) => ({
    at: e.at,
    by: e.by,
    from: e.from ?? null,
    to: e.to,
  })),
  notes: (d.notes ?? []).map((n: any) => ({
    at: n.at,
    by: id(n.by),
    text: n.text,
    score: n.score ?? undefined,
  })),
  messageToApplicant: d.messageToApplicant ?? undefined,
  consentNoticeVersion: d.consentNoticeVersion,
  consentAt: d.consentAt,
  answers: (d.answers ?? []).map((a: any) => ({ questionId: a.questionId, answer: a.answer })),
  profile:
    d.profile === null || d.profile === undefined
      ? undefined
      : {
          headline: d.profile.headline ?? "",
          educationLevel: d.profile.educationLevel,
          institution: d.profile.institution ?? "",
          field: d.profile.field ?? "",
          skills: d.profile.skills ?? [],
          about: d.profile.about ?? "",
        },
  matchPercent: d.matchPercent ?? undefined,
  interview:
    d.interview === null || d.interview === undefined
      ? undefined
      : {
          at: d.interview.at,
          mode: d.interview.mode,
          where: d.interview.where,
          note: d.interview.note ?? undefined,
        },
  agreementAcceptedAt: d.agreementAcceptedAt ?? undefined,
  agreementVersion: d.agreementVersion ?? undefined,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const toPlacement = (d: any): Placement => ({
  id: id(d._id),
  applicationId: id(d.applicationId),
  postingId: id(d.postingId),
  userId: id(d.userId),
  supervisorId: id(d.supervisorId),
  startsOn: d.startsOn,
  endsOn: d.endsOn,
  status: d.status,
  agreementVersion: d.agreementVersion,
  agreementAcceptedAt: d.agreementAcceptedAt,
  feedback: (d.feedback ?? []).map((f: any): SupervisorFeedback => ({
    at: f.at,
    by: id(f.by),
    text: f.text,
    rating: f.rating ?? undefined,
    visibleToIntern: f.visibleToIntern,
  })),
  outcomeSummary: d.outcomeSummary ?? undefined,
  endedAt: d.endedAt ?? undefined,
  createdBy: id(d.createdBy),
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

/** Drops undefined keys so Mongoose never writes them (and strict mode never complains). */
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ---------------------------------------------------------------- postings
export function createMongoPostingRepository(): PostingRepository {
  return {
    async create(input) {
      const d = await PostingModel.create({
        ...defined(input),
        supervisorIds: input.supervisorIds.map(oid),
        createdBy: oid(input.createdBy),
      });
      return toPosting(d.toObject());
    },
    async findById(postingId) {
      if (!valid(postingId)) return null;
      const d = await PostingModel.findById(postingId).lean();
      return d === null ? null : toPosting(d);
    },
    async findBySlug(slug) {
      const d = await PostingModel.findOne({ slug }).lean();
      return d === null ? null : toPosting(d);
    },
    async slugExists(slug) {
      return (await PostingModel.exists({ slug })) !== null;
    },
    async update(postingId, patch, now) {
      if (!valid(postingId)) return null;
      const { supervisorIds, ...rest } = patch;
      const set = {
        ...defined(rest),
        ...(supervisorIds === undefined ? {} : { supervisorIds: supervisorIds.map(oid) }),
        updatedAt: now,
      };
      const d = await PostingModel.findByIdAndUpdate(
        postingId,
        { $set: set },
        { new: true },
      ).lean();
      return d === null ? null : toPosting(d);
    },
    async list(query) {
      const filter: Record<string, unknown> = {};
      if (query.status !== undefined) filter["status"] = query.status;
      if (query.department !== undefined) filter["department"] = query.department;
      if (query.q !== undefined && query.q !== "") {
        filter["title"] = trusted({ $regex: escapeRegex(query.q), $options: "i" });
      }
      const [rows, total] = await Promise.all([
        PostingModel.find(filter)
          .sort({ createdAt: -1 })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .lean(),
        PostingModel.countDocuments(filter),
      ]);
      return { items: rows.map(toPosting), total, page: query.page, pageSize: query.pageSize };
    },
    async listPublished() {
      const rows = await PostingModel.find({ status: "published" })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      return rows.map(toPosting);
    },
    async countByStatus() {
      const rows = await PostingModel.aggregate<{ _id: PostingStatus; n: number }>([
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]);
      const out = Object.fromEntries(POSTING_STATUSES.map((s) => [s, 0])) as Record<
        PostingStatus,
        number
      >;
      for (const r of rows) out[r._id] = r.n;
      return out;
    },
  };
}

// ------------------------------------------------------------ applications
export function createMongoApplicationRepository(): ApplicationRepository {
  return {
    async create(input) {
      try {
        const d = await ApplicationModel.create({
          ...defined(input),
          postingId: oid(input.postingId),
          userId: oid(input.userId),
          guardian: input.guardian === undefined ? undefined : defined(input.guardian),
          events: input.events,
          notes: [],
        });
        return toApplication(d.toObject());
      } catch (err) {
        if (isDup(err)) throw new Error("DUPLICATE", { cause: err });
        throw err;
      }
    },
    async findById(appId) {
      if (!valid(appId)) return null;
      const d = await ApplicationModel.findById(appId).lean();
      return d === null ? null : toApplication(d);
    },
    async findByPostingAndUser(postingId, userId) {
      if (!valid(postingId) || !valid(userId)) return null;
      const d = await ApplicationModel.findOne({
        postingId: oid(postingId),
        userId: oid(userId),
      }).lean();
      return d === null ? null : toApplication(d);
    },
    async listByUser(userId) {
      if (!valid(userId)) return [];
      const rows = await ApplicationModel.find({ userId: oid(userId) })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      return rows.map(toApplication);
    },
    async list(query) {
      const filter: Record<string, unknown> = {};
      if (query.postingId !== undefined) {
        if (!valid(query.postingId))
          return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
        filter["postingId"] = oid(query.postingId);
      }
      if (query.userId !== undefined) {
        if (!valid(query.userId))
          return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
        filter["userId"] = oid(query.userId);
      }
      if (query.status !== undefined) filter["status"] = query.status;
      if (query.createdBefore !== undefined)
        filter["createdAt"] = trusted({ $lt: query.createdBefore });
      const order: Record<string, 1 | -1> =
        query.sort === "oldest"
          ? { createdAt: 1 }
          : query.sort === "match"
            ? { matchPercent: -1, createdAt: 1 }
            : { createdAt: -1 };
      const [rows, total] = await Promise.all([
        ApplicationModel.find(filter)
          .sort(order)
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .lean(),
        ApplicationModel.countDocuments(filter),
      ]);
      return { items: rows.map(toApplication), total, page: query.page, pageSize: query.pageSize };
    },
    async transition(appId, from, event, patch) {
      if (!valid(appId)) return null;
      const set: Record<string, unknown> = { status: event.to, updatedAt: event.at };
      if (patch?.messageToApplicant !== undefined)
        set["messageToApplicant"] = patch.messageToApplicant;
      if (patch?.agreementAcceptedAt !== undefined)
        set["agreementAcceptedAt"] = patch.agreementAcceptedAt;
      if (patch?.agreementVersion !== undefined) set["agreementVersion"] = patch.agreementVersion;
      // The status in the filter is the compare-and-set: only one of two racing writers can match.
      const d = await ApplicationModel.findOneAndUpdate(
        { _id: oid(appId), status: from },
        { $set: set, $push: { events: event } },
        { new: true },
      ).lean();
      return d === null ? null : toApplication(d);
    },
    async patch(appId, patch, now) {
      if (!valid(appId)) return null;
      const set: Record<string, unknown> = { updatedAt: now };
      const filter: Record<string, unknown> = { _id: oid(appId) };
      if (patch.messageToApplicant !== undefined)
        set["messageToApplicant"] = patch.messageToApplicant;
      if (patch.guardianVerified !== undefined) {
        set["guardian.verifiedAt"] = patch.guardianVerified.at;
        set["guardian.verifiedBy"] = oid(patch.guardianVerified.by);
        filter["guardian"] = trusted({ $exists: true });
      }
      const d = await ApplicationModel.findOneAndUpdate(
        filter,
        { $set: set },
        { new: true },
      ).lean();
      return d === null ? null : toApplication(d);
    },
    async addNote(appId, note, now) {
      if (!valid(appId)) return null;
      const d = await ApplicationModel.findByIdAndUpdate(
        appId,
        {
          $push: { notes: { ...defined(note), by: oid(note.by) } },
          $set: { updatedAt: now },
        },
        { new: true },
      ).lean();
      return d === null ? null : toApplication(d);
    },
    async countsByPosting(postingIds) {
      const ids = postingIds.filter(valid).map(oid);
      const rows = await ApplicationModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { postingId: { $in: ids } } },
        { $group: { _id: "$postingId", n: { $sum: 1 } } },
      ]);
      const out: Record<string, number> = Object.fromEntries(postingIds.map((p) => [p, 0]));
      for (const r of rows) out[id(r._id)] = r.n;
      return out;
    },
    async countOpenByUser(userId) {
      if (!valid(userId)) return 0;
      return ApplicationModel.countDocuments({
        userId: oid(userId),
        status: trusted({ $in: ["submitted", "shortlisted", "interview", "offered", "accepted"] }),
      });
    },
    async countWaiting(before) {
      return ApplicationModel.countDocuments({
        status: "submitted",
        createdAt: trusted({ $lt: before }),
      });
    },
    async setInterview(appId, interview, now) {
      if (!valid(appId)) return null;
      const d = await ApplicationModel.findByIdAndUpdate(
        appId,
        { $set: { interview: defined(interview), updatedAt: now } },
        { new: true },
      ).lean();
      return d === null ? null : toApplication(d);
    },
    async countByStatus(postingId) {
      const match =
        postingId !== undefined && valid(postingId) ? { postingId: oid(postingId) } : {};
      const rows = await ApplicationModel.aggregate<{ _id: ApplicationStatus; n: number }>([
        { $match: match },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]);
      const out = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
        ApplicationStatus,
        number
      >;
      for (const r of rows) out[r._id] = r.n;
      return out;
    },
  };
}

// -------------------------------------------------------------- placements
export function createMongoPlacementRepository(): PlacementRepository {
  return {
    async create(input) {
      try {
        const d = await PlacementModel.create({
          ...input,
          applicationId: oid(input.applicationId),
          postingId: oid(input.postingId),
          userId: oid(input.userId),
          supervisorId: oid(input.supervisorId),
          createdBy: oid(input.createdBy),
          feedback: [],
        });
        return toPlacement(d.toObject());
      } catch (err) {
        if (isDup(err)) throw new Error("DUPLICATE", { cause: err });
        throw err;
      }
    },
    async findById(pid) {
      if (!valid(pid)) return null;
      const d = await PlacementModel.findById(pid).lean();
      return d === null ? null : toPlacement(d);
    },
    async findByApplication(appId) {
      if (!valid(appId)) return null;
      const d = await PlacementModel.findOne({ applicationId: oid(appId) }).lean();
      return d === null ? null : toPlacement(d);
    },
    async listByUser(userId) {
      if (!valid(userId)) return [];
      const rows = await PlacementModel.find({ userId: oid(userId) })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      return rows.map(toPlacement);
    },
    async listBySupervisor(supervisorId) {
      if (!valid(supervisorId)) return [];
      const rows = await PlacementModel.find({ supervisorId: oid(supervisorId) })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      return rows.map(toPlacement);
    },
    async list(query) {
      const filter: Record<string, unknown> = {};
      for (const key of ["postingId", "supervisorId"] as const) {
        const value = query[key];
        if (value === undefined) continue;
        if (!valid(value))
          return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
        filter[key] = oid(value);
      }
      if (query.status !== undefined) filter["status"] = query.status;
      const [rows, total] = await Promise.all([
        PlacementModel.find(filter)
          .sort({ createdAt: -1 })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .lean(),
        PlacementModel.countDocuments(filter),
      ]);
      return { items: rows.map(toPlacement), total, page: query.page, pageSize: query.pageSize };
    },
    async countActiveBySupervisor(supervisorId) {
      if (!valid(supervisorId)) return 0;
      return PlacementModel.countDocuments({ supervisorId: oid(supervisorId), status: "active" });
    },
    async countActiveByPosting(postingId) {
      if (!valid(postingId)) return 0;
      return PlacementModel.countDocuments({ postingId: oid(postingId), status: "active" });
    },
    async activeCountsByPosting(postingIds) {
      const ids = postingIds.filter(valid).map(oid);
      const rows = await PlacementModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { status: "active", postingId: { $in: ids } } },
        { $group: { _id: "$postingId", n: { $sum: 1 } } },
      ]);
      const out: Record<string, number> = Object.fromEntries(postingIds.map((p) => [p, 0]));
      for (const r of rows) out[id(r._id)] = r.n;
      return out;
    },
    async activeLoadBySupervisor() {
      const rows = await PlacementModel.aggregate<{ _id: unknown; n: number }>([
        { $match: { status: "active" } },
        { $group: { _id: "$supervisorId", n: { $sum: 1 } } },
      ]);
      return Object.fromEntries(rows.map((r) => [id(r._id), r.n]));
    },
    async setSupervisor(pid, supervisorId, now) {
      if (!valid(pid) || !valid(supervisorId)) return null;
      const d = await PlacementModel.findOneAndUpdate(
        { _id: oid(pid), status: "active" },
        { $set: { supervisorId: oid(supervisorId), updatedAt: now } },
        { new: true },
      ).lean();
      return d === null ? null : toPlacement(d);
    },
    async end(pid, status, summary, at) {
      if (!valid(pid)) return null;
      const d = await PlacementModel.findOneAndUpdate(
        { _id: oid(pid), status: "active" },
        {
          $set: {
            status,
            endedAt: at,
            updatedAt: at,
            ...(summary === undefined ? {} : { outcomeSummary: summary }),
          },
        },
        { new: true },
      ).lean();
      return d === null ? null : toPlacement(d);
    },
    async addFeedback(pid, feedback, now) {
      if (!valid(pid)) return null;
      const d = await PlacementModel.findOneAndUpdate(
        { _id: oid(pid), status: "active" },
        {
          $push: { feedback: { ...defined(feedback), by: oid(feedback.by) } },
          $set: { updatedAt: now },
        },
        { new: true },
      ).lean();
      return d === null ? null : toPlacement(d);
    },
  };
}
