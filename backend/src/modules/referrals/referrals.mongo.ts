import { Types, trusted } from "mongoose";
import { escapeRegex } from "../../core/page.js";
import type { FunnelCounts, ReferralRepository } from "./referrals.repository.js";
import { ReferralCodeModel, ReferralEventModel, ReferralModel } from "./referrals.model.js";
import type {
  Referral,
  ReferralCode,
  ReferralEventType,
  ReferralStatus,
} from "./referrals.types.js";

const id = (v: unknown): string => String(v);
const dup = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && e.code === 11000;

interface CodeDoc {
  _id: unknown;
  userId: unknown;
  code: string;
  status: "active" | "disabled";
  assignedThreshold?: number | null;
  createdAt: Date;
}
interface RefDoc {
  _id: unknown;
  referrerId: unknown;
  inviteeId: unknown;
  code: string;
  status: ReferralStatus;
  reason?: Referral["reason"] | null;
  ipPrefix: string;
  emailKey: string;
  createdAt: Date;
  qualifiedAt?: Date | null;
  reviewedAt?: Date | null;
  reviewedBy?: unknown;
}
const toCode = (d: CodeDoc): ReferralCode => ({
  id: id(d._id),
  userId: id(d.userId),
  code: d.code,
  status: d.status,
  assignedThreshold: d.assignedThreshold ?? undefined,
  createdAt: d.createdAt,
});
const toRef = (d: RefDoc): Referral => ({
  id: id(d._id),
  referrerId: id(d.referrerId),
  inviteeId: id(d.inviteeId),
  code: d.code,
  status: d.status,
  reason: d.reason ?? undefined,
  ipPrefix: d.ipPrefix,
  emailKey: d.emailKey,
  createdAt: d.createdAt,
  qualifiedAt: d.qualifiedAt ?? undefined,
  reviewedAt: d.reviewedAt ?? undefined,
  reviewedBy: d.reviewedBy ? id(d.reviewedBy) : undefined,
});

export function createMongoReferralRepository(): ReferralRepository {
  return {
    async findCodeByUser(userId) {
      const d = await ReferralCodeModel.findOne({ userId }).lean();
      return d === null ? null : toCode(d);
    },
    async findCode(code) {
      const d = await ReferralCodeModel.findOne({ code: code.toUpperCase() }).lean();
      return d === null ? null : toCode(d);
    },
    async createCode({ userId, code, assignedThreshold }) {
      try {
        const d = await ReferralCodeModel.create({
          userId,
          code,
          ...(assignedThreshold === undefined ? {} : { assignedThreshold }),
        });
        return toCode(d.toObject());
      } catch (e) {
        if (!dup(e)) throw e;
        const existing = await ReferralCodeModel.findOne({ userId }).lean();
        if (existing !== null) return toCode(existing);
        throw new Error("CODE_TAKEN", { cause: e });
      }
    },
    async setCodeStatus(codeId, status) {
      await ReferralCodeModel.updateOne({ _id: codeId }, { $set: { status } });
    },
    async listCodes({ q, page, pageSize }) {
      const filter = q ? { code: trusted({ $regex: `^${escapeRegex(q.toUpperCase())}` }) } : {};
      const [docs, total] = await Promise.all([
        ReferralCodeModel.find(filter as never)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        ReferralCodeModel.countDocuments(filter as never),
      ]);
      return { items: docs.map((d) => toCode(d as unknown as CodeDoc)), total, page, pageSize };
    },
    async findByInvitee(inviteeId) {
      const d = await ReferralModel.findOne({ inviteeId }).lean();
      return d === null ? null : toRef(d);
    },
    async findById(rid) {
      const d = await ReferralModel.findById(rid).lean();
      return d === null ? null : toRef(d);
    },
    async create(input) {
      try {
        const d = await ReferralModel.create({
          ...input,
          reason: input.reason,
          reviewedBy: input.reviewedBy,
        });
        return toRef(d.toObject());
      } catch (e) {
        if (!dup(e)) throw e;
        const existing = await ReferralModel.findOne({ inviteeId: input.inviteeId }).lean();
        if (existing === null) throw e;
        return toRef(existing);
      }
    },
    async update(rid, patch) {
      const set: Record<string, unknown> = {};
      const unset: Record<string, 1> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) unset[k] = 1;
        else set[k] = v;
      }
      await ReferralModel.updateOne(
        { _id: rid },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
      );
    },
    async list({ status, reason, referrerId, page, pageSize }) {
      const filter: Record<string, unknown> = {};
      if (status) filter["status"] = status;
      if (reason) filter["reason"] = reason;
      if (referrerId) filter["referrerId"] = referrerId;
      const [docs, total] = await Promise.all([
        ReferralModel.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        ReferralModel.countDocuments(filter),
      ]);
      return { items: docs.map((d) => toRef(d as unknown as RefDoc)), total, page, pageSize };
    },
    async countByStatus(referrerId) {
      const rows = await ReferralModel.aggregate<{ _id: ReferralStatus; n: number }>([
        { $match: { referrerId: new Types.ObjectId(referrerId) } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]);
      const out: Record<ReferralStatus, number> = {
        pending: 0,
        qualified: 0,
        needs_review: 0,
        rejected: 0,
        revoked: 0,
      };
      for (const r of rows) out[r._id] = r.n;
      return out;
    },
    countQualifiedFromNetwork: (referrerId, ipPrefix) =>
      ReferralModel.countDocuments({ referrerId, ipPrefix, status: "qualified" }),
    countCreatedSince: (code, since) =>
      ReferralModel.countDocuments({ code, createdAt: trusted({ $gte: since }) as never }),
    async existsOtherWithEmailKey(emailKey, exceptInviteeId) {
      return (
        (await ReferralModel.exists({
          emailKey,
          inviteeId: trusted({ $ne: new Types.ObjectId(exceptInviteeId) }),
        })) !== null
      );
    },
    async appendEvent(event) {
      await ReferralEventModel.create(event);
    },
    async funnel(since) {
      const rows = await ReferralEventModel.aggregate<{
        _id: { type: ReferralEventType; variant: number | null };
        n: number;
      }>([
        { $match: { at: { $gte: since } } },
        { $group: { _id: { type: "$type", variant: "$variant" }, n: { $sum: 1 } } },
      ]);
      const out: FunnelCounts = { byType: {}, byVariant: {} };
      for (const r of rows) {
        out.byType[r._id.type] = (out.byType[r._id.type] ?? 0) + r.n;
        const key =
          r._id.variant === null || r._id.variant === undefined ? "default" : String(r._id.variant);
        (out.byVariant[key] ??= {})[r._id.type] = r.n;
      }
      return out;
    },
    async eventsByDay(since, type) {
      const rows = await ReferralEventModel.aggregate<{ _id: string; n: number }>([
        { $match: { at: { $gte: since }, type } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);
      return rows.map((r) => ({ day: r._id, count: r.n }));
    },
  };
}
