import { Schema, model } from "mongoose";
import { DEPARTMENTS, EDUCATION_LEVELS, WORK_MODES } from "./internships.types.js";

const OPTS = { versionKey: false, strict: "throw", timestamps: false } as const;
const SUB = { _id: false, strict: "throw" } as const;

const answerSchema = new Schema(
  {
    questionId: { type: String, required: true, maxlength: 20 },
    answer: { type: String, required: true, maxlength: 500 },
  },
  SUB,
);

const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    headline: { type: String, default: "", maxlength: 100 },
    educationLevel: { type: String, enum: EDUCATION_LEVELS, required: true },
    institution: { type: String, default: "", maxlength: 120 },
    field: { type: String, default: "", maxlength: 120 },
    graduationYear: { type: Number, min: 1990, max: 2100 },
    skills: { type: [String], default: [] },
    links: { type: [String], default: [] },
    about: { type: String, default: "", maxlength: 1000 },
    availableFrom: { type: Date },
    hoursPerWeek: { type: Number, min: 1, max: 60 },
    updatedAt: { type: Date, required: true },
  },
  OPTS,
);
profileSchema.index({ userId: 1 }, { unique: true });
export const ProfileModel = model("InternshipProfile", profileSchema);

const draftSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    postingId: { type: Schema.Types.ObjectId, required: true },
    statement: { type: String, default: "", maxlength: 2000 },
    links: { type: [String], default: [] },
    answers: { type: [answerSchema], default: [] },
    availableFrom: { type: Date },
    updatedAt: { type: Date, required: true },
    remindedAt: { type: Date },
  },
  OPTS,
);
draftSchema.index({ userId: 1, postingId: 1 }, { unique: true });
draftSchema.index({ postingId: 1 });
// An abandoned draft disappears by itself after 45 days.
draftSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 45 * 24 * 3600 });
export const DraftModel = model("InternshipDraft", draftSchema);

const saveSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    postingId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    remindedAt: { type: Date },
  },
  OPTS,
);
saveSchema.index({ userId: 1, postingId: 1 }, { unique: true });
saveSchema.index({ postingId: 1 });
export const SaveModel = model("InternshipSave", saveSchema);

const alertSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    departments: { type: [String], enum: DEPARTMENTS, default: [] },
    modes: { type: [String], enum: WORK_MODES, default: [] },
    keywords: { type: String, default: "", maxlength: 60 },
    active: { type: Boolean, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  OPTS,
);
alertSchema.index({ userId: 1 }, { unique: true });
alertSchema.index({ active: 1 });
export const AlertModel = model("InternshipAlert", alertSchema);
