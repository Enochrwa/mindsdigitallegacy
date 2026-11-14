import { Schema, model } from "mongoose";
import {
  COURSE_LEVELS,
  COURSE_STATUSES,
  ENROLMENT_STATUSES,
  LANGUAGES,
  LESSON_KINDS,
  LESSON_STATUSES,
  UNLOCK_VIAS,
} from "./courses.types.js";

/**
 * Collections: categories, courses, sections, lessons, enrolments, lessonprogresses.
 * Field meanings: docs/07-data-model.md. Strictness: `strict: "throw"` makes a write with an unknown field fail
 * loudly instead of being silently dropped, so typos and stray data never reach the database.
 */
const options = { timestamps: true, versionKey: false, strict: "throw" } as const;

const blockSchema = new Schema(
  {
    type: { type: String, enum: ["heading", "paragraph", "list", "note", "code"], required: true },
    text: { type: String, maxlength: 4000 },
    ordered: { type: Boolean },
    items: { type: [{ type: String, maxlength: 400 }], default: undefined },
    language: { type: String, maxlength: 20 },
  },
  { _id: false, strict: "throw" },
);

export const categorySchema = new Schema(
  {
    slug: { type: String, required: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    name: { type: String, required: true, maxlength: 80 },
    description: { type: String, required: true, maxlength: 240 },
    order: { type: Number, required: true },
    visible: { type: Boolean, default: true },
  },
  options,
);
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ visible: 1, order: 1 });

export const courseSchema = new Schema(
  {
    slug: { type: String, required: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    title: { type: String, required: true, maxlength: 100 },
    summary: { type: String, required: true, maxlength: 200 },
    description: { type: [blockSchema], default: [] },
    level: { type: String, enum: COURSE_LEVELS, required: true },
    language: { type: String, enum: LANGUAGES, required: true },
    status: { type: String, enum: COURSE_STATUSES, required: true, default: "draft" },
    order: { type: Number, required: true },
    tags: { type: [{ type: String, maxlength: 80 }], default: [] },
    outcomes: { type: [{ type: String, maxlength: 160 }], default: [] },
    audience: { type: String, required: true, maxlength: 200 },
    prerequisiteIds: { type: [Schema.Types.ObjectId], default: [] },
    instructors: {
      type: [
        new Schema(
          {
            name: { type: String, required: true, maxlength: 80 },
            title: { type: String, required: true, maxlength: 80 },
          },
          { _id: false, strict: "throw" },
        ),
      ],
      default: [],
    },
    unlockPolicy: {
      type: { type: String, enum: ["open", "referral", "code"], required: true },
      threshold: { type: Number, min: 1, max: 50 },
    },
    stats: {
      lessonCount: { type: Number, required: true, min: 0 },
      requiredLessonCount: { type: Number, required: true, min: 0 },
      totalDurationSec: { type: Number, required: true, min: 0 },
    },
    contentVersion: { type: Number, required: true, default: 1, min: 1 },
    /** Hash of the authored content; lets the importer bump `contentVersion` only when something changed. */
    contentHash: { type: String, required: true, maxlength: 64 },
    publishedAt: { type: Date },
    archivedAt: { type: Date },
  },
  options,
);
courseSchema.index({ slug: 1 }, { unique: true });
courseSchema.index({ status: 1, categoryId: 1, order: 1 });
courseSchema.index({ status: 1, level: 1 });
courseSchema.index({ status: 1, tags: 1 });

export const sectionSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    order: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, maxlength: 120 },
    summary: { type: String, maxlength: 240 },
  },
  options,
);
sectionSchema.index({ courseId: 1, order: 1 }, { unique: true });

export const lessonSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    order: { type: Number, required: true, min: 1 },
    slug: { type: String, required: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    title: { type: String, required: true, maxlength: 120 },
    summary: { type: String, required: true, maxlength: 240 },
    kind: { type: String, enum: LESSON_KINDS, required: true },
    status: { type: String, enum: LESSON_STATUSES, required: true, default: "draft" },
    required: { type: Boolean, default: true },
    isPreview: { type: Boolean, default: false },
    video: {
      provider: { type: String, enum: ["youtube"] },
      videoId: { type: String, match: /^[A-Za-z0-9_-]{11}$/ },
      durationSec: { type: Number, min: 1, max: 14_400 },
    },
    body: { type: [blockSchema], default: [] },
    transcript: {
      language: { type: String, enum: LANGUAGES },
      paragraphs: { type: [{ type: String, maxlength: 2000 }], default: undefined },
    },
    resources: {
      type: [
        new Schema(
          {
            title: { type: String, required: true, maxlength: 120 },
            url: { type: String, required: true, match: /^https:\/\//, maxlength: 500 },
            kind: { type: String, enum: ["link", "download"], required: true },
          },
          { _id: false, strict: "throw" },
        ),
      ],
      default: [],
    },
  },
  options,
);
lessonSchema.index({ courseId: 1, slug: 1 }, { unique: true });
lessonSchema.index({ courseId: 1, status: 1, order: 1 });

export const enrolmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    status: { type: String, enum: ENROLMENT_STATUSES, required: true, default: "active" },
    access: {
      state: { type: String, enum: ["locked", "unlocked"], required: true },
      unlockedAt: { type: Date },
      via: { type: String, enum: UNLOCK_VIAS },
    },
    enrolledAt: { type: Date, required: true },
    completedAt: { type: Date },
    withdrawnAt: { type: Date },
    lastLessonId: { type: Schema.Types.ObjectId, ref: "Lesson" },
    lastActivityAt: { type: Date, required: true },
  },
  options,
);
enrolmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });
enrolmentSchema.index({ userId: 1, lastActivityAt: -1 });
enrolmentSchema.index({ courseId: 1, status: 1 });

export const progressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    status: { type: String, enum: ["in_progress", "completed"], required: true },
    positionSec: { type: Number, min: 0, max: 14_400 },
    firstStartedAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  options,
);
progressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
progressSchema.index({ userId: 1, courseId: 1 });

export const CategoryModel = model("Category", categorySchema);
export const CourseModel = model("Course", courseSchema);
export const SectionModel = model("Section", sectionSchema);
export const LessonModel = model("Lesson", lessonSchema);
export const EnrolmentModel = model("Enrolment", enrolmentSchema);
export const ProgressModel = model("LessonProgress", progressSchema);
