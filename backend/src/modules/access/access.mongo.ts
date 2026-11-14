import { Types, trusted } from "mongoose";
import { escapeRegex } from "../../core/page.js";
import { EntitlementModel, RedemptionModel, UnlockCodeModel } from "./access.model.js";
import type {
  Entitlement,
  EntitlementRepository,
  UnlockCode,
  UnlockCodeRepository,
} from "./access.types.js";

const str = (v: unknown): string => String(v);
const dup = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && e.code === 11000;

interface EntDoc {
  _id: unknown;
  userId: unknown;
  scope: { type: "all" | "course"; courseId?: unknown };
  via: Entitlement["via"];
  sourceId?: string | null;
  grantedBy?: unknown;
  note?: string | null;
  grantedAt: Date;
  revokedAt?: Date | null;
  revokedBy?: unknown;
}
const toEnt = (d: EntDoc): Entitlement => ({
  id: str(d._id),
  userId: str(d.userId),
  via: d.via,
  scope:
    d.scope.type === "all" ? { type: "all" } : { type: "course", courseId: str(d.scope.courseId) },
  sourceId: d.sourceId ?? undefined,
  grantedBy: d.grantedBy ? str(d.grantedBy) : undefined,
  note: d.note ?? undefined,
  grantedAt: d.grantedAt,
  revokedAt: d.revokedAt ?? undefined,
  revokedBy: d.revokedBy ? str(d.revokedBy) : undefined,
});

export function createMongoEntitlementRepository(): EntitlementRepository {
  return {
    async grant(input) {
      const scopeFilter =
        input.scope.type === "all"
          ? { "scope.type": "all" }
          : { "scope.type": "course", "scope.courseId": input.scope.courseId };
      const existing = await EntitlementModel.findOne({
        userId: input.userId,
        via: input.via,
        sourceId: input.sourceId ?? trusted({ $exists: false }),
        revokedAt: trusted({ $exists: false }),
        ...scopeFilter,
      } as never).lean();
      if (existing !== null) return { entitlement: toEnt(existing), created: false };
      const doc = await EntitlementModel.create({
        userId: input.userId,
        via: input.via,
        scope: input.scope,
        grantedAt: input.grantedAt,
        ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
        ...(input.grantedBy === undefined ? {} : { grantedBy: input.grantedBy }),
        ...(input.note === undefined ? {} : { note: input.note }),
      });
      return { entitlement: toEnt(doc.toObject()), created: true };
    },
    async listForUser(userId) {
      const docs = await EntitlementModel.find({ userId }).sort({ grantedAt: -1 }).lean();
      return docs.map((d) => toEnt(d as unknown as EntDoc));
    },
    async revoke(id, at, by) {
      await EntitlementModel.updateOne(
        { _id: id, revokedAt: trusted({ $exists: false }) },
        { $set: { revokedAt: at, ...(by ? { revokedBy: by } : {}) } },
      );
    },
    async findById(id) {
      const d = await EntitlementModel.findById(id).lean();
      return d === null ? null : toEnt(d);
    },
  };
}

interface CodeDoc {
  _id: unknown;
  code: string;
  kind: UnlockCode["kind"];
  label: string;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: Date | null;
  status: "active" | "disabled";
  courseIds?: unknown[];
  createdBy?: unknown;
  createdAt: Date;
}
const toCode = (d: CodeDoc): UnlockCode => ({
  id: str(d._id),
  code: d.code,
  kind: d.kind,
  label: d.label,
  maxUses: d.maxUses ?? null,
  usedCount: d.usedCount,
  expiresAt: d.expiresAt ?? undefined,
  status: d.status,
  courseIds: (d.courseIds ?? []).map(str),
  createdBy: d.createdBy ? str(d.createdBy) : undefined,
  createdAt: d.createdAt,
});

export function createMongoUnlockCodeRepository(): UnlockCodeRepository {
  return {
    async create({ now, maxUses, expiresAt, createdBy, ...rest }) {
      void now;
      const doc = await UnlockCodeModel.create({
        ...rest,
        ...(maxUses === null ? {} : { maxUses }),
        ...(expiresAt ? { expiresAt } : {}),
        ...(createdBy ? { createdBy } : {}),
      });
      return toCode(doc.toObject());
    },
    async findByCode(code) {
      const d = await UnlockCodeModel.findOne({ code: code.toUpperCase() }).lean();
      return d === null ? null : toCode(d);
    },
    async findById(id) {
      const d = await UnlockCodeModel.findById(id).lean();
      return d === null ? null : toCode(d);
    },
    async list({ page, pageSize, q }) {
      const filter = q ? { code: trusted({ $regex: `^${escapeRegex(q.toUpperCase())}` }) } : {};
      const [docs, total] = await Promise.all([
        UnlockCodeModel.find(filter as never)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        UnlockCodeModel.countDocuments(filter as never),
      ]);
      return { items: docs.map((d) => toCode(d as unknown as CodeDoc)), total, page, pageSize };
    },
    async update(id, patch) {
      const set: Record<string, unknown> = {};
      const unset: Record<string, 1> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null) unset[k] = 1;
        else set[k] = v;
      }
      await UnlockCodeModel.updateOne(
        { _id: id },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
      );
    },
    async redeem(codeId, userId, now) {
      const code = await UnlockCodeModel.findById(codeId).lean();
      if (code === null || code.status !== "active") return "inactive";
      if (code.expiresAt && code.expiresAt <= now) return "expired";
      try {
        await RedemptionModel.create({ codeId, userId, at: now });
      } catch (e) {
        if (dup(e)) return "already";
        throw e;
      }
      // The cap is enforced by the update filter, so two simultaneous redemptions cannot both take the last use.
      const cap = code.maxUses;
      const res = await UnlockCodeModel.updateOne(
        {
          _id: codeId,
          ...(cap === undefined || cap === null ? {} : { usedCount: trusted({ $lt: cap }) }),
        },
        { $inc: { usedCount: 1 } },
      );
      if (res.modifiedCount !== 1) {
        await RedemptionModel.deleteOne({ codeId, userId });
        return "exhausted";
      }
      return "ok";
    },
    async listRedemptions(codeId) {
      const docs = await RedemptionModel.find({ codeId: new Types.ObjectId(codeId) })
        .sort({ at: -1 })
        .limit(500)
        .lean();
      return docs.map((d) => ({ userId: str(d.userId), at: d.at }));
    },
  };
}
