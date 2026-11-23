import { Types, trusted } from "mongoose";
import { AlertModel, DraftModel, ProfileModel, SaveModel } from "./internships.extras.model.js";
import type {
  ExtrasRepositories,
  InternshipAlert,
  InternshipDraft,
  InternshipProfile,
  InternshipSave,
} from "./internships.extras.types.js";

const oid = (v: string): Types.ObjectId => new Types.ObjectId(v);
const valid = (v: string): boolean => Types.ObjectId.isValid(v);
const id = (v: unknown): string => String(v);

function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- lean documents are loosely typed; each mapper names every field */
const toProfile = (d: any): InternshipProfile => ({
  userId: id(d.userId),
  headline: d.headline ?? "",
  educationLevel: d.educationLevel,
  institution: d.institution ?? "",
  field: d.field ?? "",
  graduationYear: d.graduationYear ?? undefined,
  skills: d.skills ?? [],
  links: d.links ?? [],
  about: d.about ?? "",
  availableFrom: d.availableFrom ?? undefined,
  hoursPerWeek: d.hoursPerWeek ?? undefined,
  updatedAt: d.updatedAt,
});
const toDraft = (d: any): InternshipDraft => ({
  userId: id(d.userId),
  postingId: id(d.postingId),
  statement: d.statement ?? "",
  links: d.links ?? [],
  answers: (d.answers ?? []).map((a: any) => ({ questionId: a.questionId, answer: a.answer })),
  availableFrom: d.availableFrom ?? undefined,
  updatedAt: d.updatedAt,
  remindedAt: d.remindedAt ?? undefined,
});
const toSave = (d: any): InternshipSave => ({
  userId: id(d.userId),
  postingId: id(d.postingId),
  createdAt: d.createdAt,
  remindedAt: d.remindedAt ?? undefined,
});
const toAlert = (d: any): InternshipAlert => ({
  userId: id(d.userId),
  departments: d.departments ?? [],
  modes: d.modes ?? [],
  keywords: d.keywords ?? "",
  active: d.active,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

export function createMongoExtras(): ExtrasRepositories {
  return {
    profiles: {
      async get(userId) {
        if (!valid(userId)) return null;
        const d = await ProfileModel.findOne({ userId: oid(userId) }).lean();
        return d === null ? null : toProfile(d);
      },
      async upsert(profile) {
        const { userId, graduationYear, availableFrom, hoursPerWeek, ...rest } = profile;
        const optional = { graduationYear, availableFrom, hoursPerWeek };
        const unset = Object.keys(optional).filter(
          (k) => optional[k as keyof typeof optional] === undefined,
        );
        const d = await ProfileModel.findOneAndUpdate(
          { userId: oid(userId) },
          {
            $set: { ...rest, ...defined(optional) },
            ...(unset.length === 0 ? {} : { $unset: Object.fromEntries(unset.map((k) => [k, 1])) }),
          },
          { upsert: true, new: true },
        ).lean();
        return toProfile(d);
      },
      async remove(userId) {
        if (!valid(userId)) return false;
        return (await ProfileModel.deleteOne({ userId: oid(userId) })).deletedCount > 0;
      },
    },
    drafts: {
      async get(userId, postingId) {
        if (!valid(userId) || !valid(postingId)) return null;
        const d = await DraftModel.findOne({
          userId: oid(userId),
          postingId: oid(postingId),
        }).lean();
        return d === null ? null : toDraft(d);
      },
      async upsert(draft) {
        const { userId, postingId, ...rest } = draft;
        const d = await DraftModel.findOneAndUpdate(
          { userId: oid(userId), postingId: oid(postingId) },
          {
            $set: defined(rest),
            ...(draft.availableFrom === undefined ? { $unset: { availableFrom: 1 } } : {}),
          },
          { upsert: true, new: true },
        ).lean();
        return toDraft(d);
      },
      async remove(userId, postingId) {
        if (!valid(userId) || !valid(postingId)) return false;
        return (
          (await DraftModel.deleteOne({ userId: oid(userId), postingId: oid(postingId) }))
            .deletedCount > 0
        );
      },
      async listByUser(userId) {
        if (!valid(userId)) return [];
        return (
          await DraftModel.find({ userId: oid(userId) })
            .limit(50)
            .lean()
        ).map(toDraft);
      },
      async listForReminder(postingIds) {
        const ids = postingIds.filter(valid).map(oid);
        const rows = await DraftModel.find({
          postingId: { $in: ids },
          remindedAt: trusted({ $exists: false }),
        })
          .limit(500)
          .lean();
        return rows.map(toDraft);
      },
      async markReminded(userId, postingId, at) {
        if (valid(userId) && valid(postingId)) {
          await DraftModel.updateOne(
            { userId: oid(userId), postingId: oid(postingId) },
            { $set: { remindedAt: at } },
          );
        }
      },
    },
    saves: {
      async add(userId, postingId, now) {
        const r = await SaveModel.updateOne(
          { userId: oid(userId), postingId: oid(postingId) },
          { $setOnInsert: { createdAt: now } },
          { upsert: true },
        );
        return r.upsertedCount > 0;
      },
      async remove(userId, postingId) {
        if (!valid(userId) || !valid(postingId)) return false;
        return (
          (await SaveModel.deleteOne({ userId: oid(userId), postingId: oid(postingId) }))
            .deletedCount > 0
        );
      },
      async listByUser(userId) {
        if (!valid(userId)) return [];
        return (
          await SaveModel.find({ userId: oid(userId) })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean()
        ).map(toSave);
      },
      async has(userId, postingId) {
        if (!valid(userId) || !valid(postingId)) return false;
        return (
          (await SaveModel.exists({ userId: oid(userId), postingId: oid(postingId) })) !== null
        );
      },
      async listForReminder(postingIds) {
        const ids = postingIds.filter(valid).map(oid);
        const rows = await SaveModel.find({
          postingId: { $in: ids },
          remindedAt: trusted({ $exists: false }),
        })
          .limit(500)
          .lean();
        return rows.map(toSave);
      },
      async markReminded(userId, postingId, at) {
        if (valid(userId) && valid(postingId)) {
          await SaveModel.updateOne(
            { userId: oid(userId), postingId: oid(postingId) },
            { $set: { remindedAt: at } },
          );
        }
      },
    },
    alerts: {
      async get(userId) {
        if (!valid(userId)) return null;
        const d = await AlertModel.findOne({ userId: oid(userId) }).lean();
        return d === null ? null : toAlert(d);
      },
      async upsert(alert) {
        const { userId, createdAt, ...rest } = alert;
        const d = await AlertModel.findOneAndUpdate(
          { userId: oid(userId) },
          { $set: rest, $setOnInsert: { createdAt } },
          { upsert: true, new: true },
        ).lean();
        return toAlert(d);
      },
      async remove(userId) {
        if (!valid(userId)) return false;
        return (await AlertModel.deleteOne({ userId: oid(userId) })).deletedCount > 0;
      },
      async listActive(limit) {
        return (await AlertModel.find({ active: true }).limit(limit).lean()).map(toAlert);
      },
    },
    async removeAllForUser(userId): Promise<Record<string, number>> {
      if (!valid(userId)) return {};
      const u = oid(userId);
      return {
        profile: (await ProfileModel.deleteMany({ userId: u })).deletedCount,
        drafts: (await DraftModel.deleteMany({ userId: u })).deletedCount,
        saves: (await SaveModel.deleteMany({ userId: u })).deletedCount,
        alerts: (await AlertModel.deleteMany({ userId: u })).deletedCount,
      };
    },
  };
}
