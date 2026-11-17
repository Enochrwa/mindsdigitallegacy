import { Schema, model } from "mongoose";
import {
  APPLICATION_STATUSES,
  COMPENSATION,
  DEPARTMENTS,
  PLACEMENT_STATUSES,
  POSTING_STATUSES,
  WORK_MODES,
} from "./internships.types.js";

const OPTS = { versionKey: false, strict: "throw", timestamps: true } as const;
const SUB = { _id: false, strict: "throw" } as const;

const postingSchema = new Schema(
  {
    slug: { type: String, required: true, maxlength: 60 },
    title: { type: String, required: true, maxlength: 100 },
    department: { type: String, enum: DEPARTMENTS, required: true },
    summary: { type: String, required: true, maxlength: 300 },
    description: { type: String, required: true, maxlength: 4000 },
    requirements: { type: [String], default: [] },
    learningGoals: { type: [String], default: [] },
    mode: { type: String, enum: WORK_MODES, required: true },
    location: { type: String, required: true, maxlength: 100 },
    durationWeeks: { type: Number, required: true, min: 2, max: 26 },
    hoursPerWeek: { type: Number, required: true, min: 4, max: 40 },
    compensation: { type: String, enum: COMPENSATION, required: true },
    compensationNote: { type: String, default: "", maxlength: 300 },
    minAge: { type: Number, enum: [16, 18], required: true },
    slots: { type: Number, required: true, min: 1, max: 20 },
    supervisorIds: { type: [Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: POSTING_STATUSES, required: true },
    opensAt: { type: Date },
    closesAt: { type: Date },
    publishedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  OPTS,
);
postingSchema.index({ slug: 1 }, { unique: true });
postingSchema.index({ status: 1, createdAt: -1 });
postingSchema.index({ department: 1, status: 1 });
export const PostingModel = model("InternshipPosting", postingSchema);

const eventSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: String, required: true, maxlength: 40 },
    from: { type: String, enum: [...APPLICATION_STATUSES, null], default: null },
    to: { type: String, enum: APPLICATION_STATUSES, required: true },
  },
  SUB,
);
const noteSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, required: true },
    text: { type: String, required: true, maxlength: 1000 },
    score: { type: Number, min: 1, max: 5 },
  },
  SUB,
);
const guardianSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    relationship: { type: String, required: true, maxlength: 50 },
    contact: { type: String, required: true, maxlength: 150 },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId },
  },
  SUB,
);

const applicationSchema = new Schema(
  {
    postingId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    statement: { type: String, required: true, maxlength: 2000 },
    links: { type: [String], default: [] },
    availableFrom: { type: Date },
    under18: { type: Boolean, required: true },
    guardian: { type: guardianSchema },
    status: { type: String, enum: APPLICATION_STATUSES, required: true },
    events: { type: [eventSchema], default: [] },
    notes: { type: [noteSchema], default: [] },
    messageToApplicant: { type: String, maxlength: 500 },
    consentNoticeVersion: { type: String, required: true, maxlength: 40 },
    consentAt: { type: Date, required: true },
    agreementAcceptedAt: { type: Date },
    agreementVersion: { type: String, maxlength: 40 },
  },
  OPTS,
);
// One application per person per posting: this is what makes applying idempotent under a double click.
applicationSchema.index({ postingId: 1, userId: 1 }, { unique: true });
applicationSchema.index({ userId: 1, createdAt: -1 });
applicationSchema.index({ status: 1, createdAt: -1 });
applicationSchema.index({ postingId: 1, status: 1 });
export const ApplicationModel = model("InternshipApplication", applicationSchema);

const feedbackSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, required: true },
    text: { type: String, required: true, maxlength: 1500 },
    rating: { type: Number, min: 1, max: 5 },
    visibleToIntern: { type: Boolean, required: true },
  },
  SUB,
);

const placementSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, required: true },
    postingId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    supervisorId: { type: Schema.Types.ObjectId, required: true },
    startsOn: { type: Date, required: true },
    endsOn: { type: Date, required: true },
    status: { type: String, enum: PLACEMENT_STATUSES, required: true },
    agreementVersion: { type: String, required: true, maxlength: 40 },
    agreementAcceptedAt: { type: Date, required: true },
    feedback: { type: [feedbackSchema], default: [] },
    outcomeSummary: { type: String, maxlength: 1000 },
    endedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  OPTS,
);
placementSchema.index({ applicationId: 1 }, { unique: true });
placementSchema.index({ userId: 1, status: 1 });
placementSchema.index({ supervisorId: 1, status: 1 });
placementSchema.index({ postingId: 1, status: 1 });
export const PlacementModel = model("InternshipPlacement", placementSchema);
