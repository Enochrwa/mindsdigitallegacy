import { Schema, model, trusted } from "mongoose";
import { DEFAULT_SETTINGS, withDefaults } from "./settings.js";
import type { Settings, SettingsRepository } from "./settings.js";

const settingsSchema = new Schema(
  {
    key: { type: String, required: true, enum: ["platform"] },
    version: { type: Number, required: true },
    settings: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
);
settingsSchema.index({ key: 1 }, { unique: true });
export const SettingsModel = model("Setting", settingsSchema);

export function createMongoSettingsRepository(): SettingsRepository {
  return {
    async get() {
      const doc = await SettingsModel.findOne({ key: "platform" }).lean();
      if (doc === null) return { settings: DEFAULT_SETTINGS, version: 0 };
      return {
        settings: withDefaults(doc.settings as Partial<Settings>),
        version: doc.version,
        updatedAt: (doc as { updatedAt?: Date }).updatedAt,
        updatedBy:
          doc.updatedBy === undefined || doc.updatedBy === null ? undefined : String(doc.updatedBy),
      };
    },
    async save(settings, expectedVersion, by) {
      if (expectedVersion === 0) {
        try {
          await SettingsModel.create({ key: "platform", version: 1, settings, updatedBy: by });
          return true;
        } catch {
          return false; // someone else created it first
        }
      }
      const res = await SettingsModel.updateOne(
        { key: "platform", version: trusted({ $eq: expectedVersion }) },
        { $set: { settings, updatedBy: by }, $inc: { version: 1 } },
      );
      return res.modifiedCount === 1;
    },
  };
}
