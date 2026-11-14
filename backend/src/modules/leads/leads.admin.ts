import { Types, trusted } from "mongoose";
import { escapeRegex } from "../../core/page.js";
import type { Page, PageRequest } from "../../core/page.js";
import { LeadModel } from "./leads.model.js";
import type { Lead, LeadNote, LeadPriority, LeadStatus } from "./leads.model.js";
import type { LeadKind } from "./leads.schema.js";

export interface LeadListQuery extends PageRequest {
  q?: string | undefined;
  kind?: LeadKind | undefined;
  status?: LeadStatus | undefined;
  priority?: LeadPriority | undefined;
  assignedTo?: string | undefined; // a user id, or the word "unassigned"
  tag?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  /** Only leads whose follow-up date has passed and that are still open. */
  overdue?: boolean | undefined;
  now?: Date | undefined;
  sort?: "newest" | "oldest" | "followUp" | undefined;
}

export interface LeadPatch {
  status?: LeadStatus;
  priority?: LeadPriority;
  assignedTo?: string | null;
  tags?: string[];
  followUpAt?: Date | null;
}

/** Staff side of the lead pipeline. The public form only ever calls `LeadRepository.create`. */
export interface LeadAdminRepository {
  list(query: LeadListQuery): Promise<Page<Lead>>;
  findById(id: string): Promise<Lead | null>;
  update(id: string, patch: LeadPatch, at: Date): Promise<Lead | null>;
  addNote(id: string, by: string, text: string, at: Date): Promise<LeadNote | null>;
  remove(id: string): Promise<boolean>;
  countByStatus(): Promise<Record<LeadStatus, number>>;
  countByKind(): Promise<Record<string, number>>;
  byDay(since: Date): Promise<{ day: string; count: number }[]>;
  overdueCount(now: Date): Promise<number>;
  /** For CSV export: capped so one click cannot dump the database. */
  exportRows(query: Omit<LeadListQuery, "page" | "pageSize">, limit: number): Promise<Lead[]>;
}

interface LeadDoc {
  _id: unknown;
  status: LeadStatus;
  priority?: LeadPriority | null;
  assignedTo?: unknown;
  tags?: string[] | null;
  followUpAt?: Date | null;
  notes?: { _id: unknown; at: Date; by: unknown; text: string }[] | null;
  statusChangedAt?: Date | null;
  createdAt: Date;
  [key: string]: unknown;
}

function toLead(d: LeadDoc): Lead {
  const { _id, assignedTo, notes, ...rest } = d;
  return {
    ...(rest as unknown as Lead),
    id: String(_id),
    priority: d.priority ?? "normal",
    assignedTo: assignedTo instanceof Types.ObjectId ? assignedTo.toString() : undefined,
    tags: d.tags ?? [],
    followUpAt: d.followUpAt ?? undefined,
    statusChangedAt: d.statusChangedAt ?? undefined,
    notes: (notes ?? []).map((n) => ({
      id: String(n._id),
      at: n.at,
      by: String(n.by),
      text: n.text,
    })),
  };
}

function filterOf(q: Omit<LeadListQuery, "page" | "pageSize">): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (q.kind) f["kind"] = q.kind;
  if (q.status) f["status"] = q.status;
  if (q.priority) f["priority"] = q.priority;
  if (q.tag) f["tags"] = q.tag;
  if (q.assignedTo === "unassigned") f["assignedTo"] = trusted({ $exists: false });
  else if (q.assignedTo) f["assignedTo"] = q.assignedTo;
  if (q.from || q.to)
    f["createdAt"] = trusted({
      ...(q.from ? { $gte: q.from } : {}),
      ...(q.to ? { $lte: q.to } : {}),
    });
  if (q.overdue) {
    f["followUpAt"] = trusted({ $lte: q.now ?? new Date() });
    f["status"] = trusted({ $in: ["new", "contacted", "qualified"] });
  }
  if (q.q?.trim()) {
    const safe = escapeRegex(q.q.trim());
    f["$or"] = [
      { email: trusted({ $regex: `^${safe}`, $options: "i" }) },
      { fullName: trusted({ $regex: safe, $options: "i" }) },
      { organization: trusted({ $regex: safe, $options: "i" }) },
    ];
  }
  return f;
}

const sortOf = (s: LeadListQuery["sort"]): Record<string, 1 | -1> =>
  s === "oldest"
    ? { createdAt: 1 }
    : s === "followUp"
      ? { followUpAt: 1, createdAt: -1 }
      : { createdAt: -1 };

export function createMongoLeadAdminRepository(): LeadAdminRepository {
  return {
    async list(query) {
      const filter = trusted(filterOf(query)) as never;
      const [docs, total] = await Promise.all([
        LeadModel.find(filter)
          .sort(sortOf(query.sort))
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .lean(),
        LeadModel.countDocuments(filter),
      ]);
      return {
        items: docs.map((d) => toLead(d as unknown as LeadDoc)),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    async findById(id) {
      if (!Types.ObjectId.isValid(id)) return null;
      const d = await LeadModel.findById(id).lean();
      return d === null ? null : toLead(d);
    },
    async update(id, patch, at) {
      if (!Types.ObjectId.isValid(id)) return null;
      const set: Record<string, unknown> = {};
      const unset: Record<string, 1> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined) unset[k] = 1;
        else set[k] = v;
      }
      if (patch.status !== undefined) set["statusChangedAt"] = at;
      const d = await LeadModel.findOneAndUpdate(
        { _id: id },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { returnDocument: "after" },
      ).lean();
      return d === null ? null : toLead(d);
    },
    async addNote(id, by, text, at) {
      if (!Types.ObjectId.isValid(id)) return null;
      const d = await LeadModel.findOneAndUpdate(
        { _id: id },
        { $push: { notes: { at, by, text } } },
        { returnDocument: "after" },
      ).lean();
      if (d === null) return null;
      const note = toLead(d).notes.at(-1);
      return note ?? null;
    },
    async remove(id) {
      if (!Types.ObjectId.isValid(id)) return false;
      return (await LeadModel.deleteOne({ _id: id })).deletedCount === 1;
    },
    async countByStatus() {
      const rows = await LeadModel.aggregate<{ _id: LeadStatus; n: number }>([
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]);
      const out: Record<LeadStatus, number> = {
        new: 0,
        contacted: 0,
        qualified: 0,
        converted: 0,
        closed: 0,
        spam: 0,
      };
      for (const r of rows) out[r._id] = r.n;
      return out;
    },
    async countByKind() {
      const rows = await LeadModel.aggregate<{ _id: string; n: number }>([
        { $group: { _id: "$kind", n: { $sum: 1 } } },
      ]);
      return Object.fromEntries(rows.map((r) => [r._id, r.n]));
    },
    async byDay(since) {
      const rows = await LeadModel.aggregate<{ _id: string; n: number }>([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            n: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      return rows.map((r) => ({ day: r._id, count: r.n }));
    },
    overdueCount: (now) =>
      LeadModel.countDocuments({
        followUpAt: trusted({ $lte: now }),
        status: trusted({ $in: ["new", "contacted", "qualified"] }),
      } as never),
    async exportRows(query, limit) {
      const docs = await LeadModel.find(trusted(filterOf(query)) as never)
        .sort(sortOf(query.sort))
        .limit(limit)
        .lean();
      return docs.map((d) => toLead(d as unknown as LeadDoc));
    },
  };
}
