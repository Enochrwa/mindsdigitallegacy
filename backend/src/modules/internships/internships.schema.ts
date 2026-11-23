import { z } from "zod";
import {
  APPLICATION_STATUSES,
  COMPENSATION,
  DEPARTMENTS,
  EDUCATION_LEVELS,
  INTERVIEW_MODES,
  PLACEMENT_STATUSES,
  POSTING_STATUSES,
  WORK_MODES,
} from "./internships.types.js";
import { cleanLink, STAFF_TARGETS } from "./internships.rules.js";
import { SORTS } from "./internships.discovery.js";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const idLike = z.string().trim().min(1).max(40);
const list = (min: number, max: number, itemMax: number) =>
  z.array(text(3, itemMax)).min(min).max(max);

const answerSchema = z.strictObject({
  questionId: z.string().regex(/^[a-z][a-z0-9_]{0,19}$/),
  answer: z.string().max(500),
});

/** https links, trimmed, de-duplicated, at most five. */
const linkList = z
  .array(z.string().trim().max(300))
  .max(5)
  .transform((links, ctx) => {
    const out: string[] = [];
    for (const raw of links) {
      const clean = cleanLink(raw);
      if (clean === null) {
        ctx.addIssue({ code: "custom", message: "Links must start with https://" });
        return z.NEVER;
      }
      out.push(clean);
    }
    return [...new Set(out)];
  });

/** Public application form. Strict: unknown fields are rejected, so nothing unexpected is stored. */
export const applySchema = z.strictObject({
  statement: text(50, 2000),
  links: linkList.default([]),
  availableFrom: z.coerce.date().optional(),
  under18: z.boolean(),
  guardian: z
    .strictObject({
      name: text(2, 100),
      relationship: text(2, 50),
      contact: text(5, 150),
    })
    .optional(),
  answers: z.array(answerSchema).max(5).default([]),
  useProfile: z.boolean().optional(),
  consent: z.literal(true, { error: "You must accept the privacy notice to apply." }),
  privacyNoticeVersion: text(1, 40),
});

export const acceptSchema = z.strictObject({ agreementVersion: text(1, 40) });

/** A short tag such as a skill or a perk. */
const tag = (max: number) => z.string().trim().min(2).max(max);

const questionSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,19}$/, "Use lowercase letters, digits and underscores"),
    label: text(5, 200),
    kind: z.enum(["text", "yes_no", "choice"]),
    required: z.boolean(),
    options: z.array(text(1, 60)).min(2).max(6).optional(),
  })
  .refine((q) => (q.kind === "choice" ? q.options !== undefined : q.options === undefined), {
    path: ["options"],
    message: "Choice questions need 2 to 6 options; other kinds must not have any",
  });

const questionList = z
  .array(questionSchema)
  .max(5)
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, {
    message: "Question ids must be unique",
  });

/**
 * The fields of a posting WITHOUT defaults. Defaults are added only for creating (below): if they were
 * part of the update schema, editing one field would silently reset every other defaulted field.
 */
const postingBase = {
  title: text(5, 100),
  department: z.enum(DEPARTMENTS),
  summary: text(20, 300),
  description: text(50, 4000),
  requirements: list(1, 12, 200),
  learningGoals: list(1, 10, 200),
  mode: z.enum(WORK_MODES),
  location: text(2, 100),
  durationWeeks: z.number().int().min(2).max(26),
  hoursPerWeek: z.number().int().min(4).max(40),
  compensation: z.enum(COMPENSATION),
  compensationNote: z.string().trim().max(300),
  minAge: z.union([z.literal(16), z.literal(18)]),
  slots: z.number().int().min(1).max(20),
  skills: z.array(tag(40)).max(10),
  responsibilities: z.array(text(3, 200)).max(10),
  whoCanApply: z.array(text(3, 200)).max(8),
  perks: z.array(text(3, 100)).max(8),
  startsOn: z.coerce.date().optional(),
  screeningQuestions: questionList,
  supervisorIds: z.array(idLike).max(10),
  opensAt: z.coerce.date().optional(),
  closesAt: z.coerce.date().optional(),
};

const postingCreateFields = {
  ...postingBase,
  compensationNote: postingBase.compensationNote.default(""),
  skills: postingBase.skills.default([]),
  responsibilities: postingBase.responsibilities.default([]),
  whoCanApply: postingBase.whoCanApply.default([]),
  perks: postingBase.perks.default([]),
  screeningQuestions: postingBase.screeningQuestions.default([]),
  supervisorIds: postingBase.supervisorIds.default([]),
};

const datesOrdered = (v: { opensAt?: Date | undefined; closesAt?: Date | undefined }): boolean =>
  v.opensAt === undefined || v.closesAt === undefined || v.closesAt > v.opensAt;
const datesMessage = {
  message: "The closing date must be after the opening date.",
  path: ["closesAt"],
};

export const postingCreateSchema = z
  .strictObject(postingCreateFields)
  .refine(datesOrdered, datesMessage);
export const postingPatchSchema = z
  .strictObject(postingBase)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change." })
  .refine(datesOrdered, datesMessage);

export const postingQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(POSTING_STATUSES).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  q: z.string().trim().max(100).optional(),
});

/** A list typed as `a,b,c` in the address, checked against the allowed values. */
const csv = <T extends string>(allowed: readonly [T, ...T[]]) =>
  z
    .string()
    .max(200)
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x !== ""),
    )
    .pipe(z.array(z.enum(allowed)).max(10));

const flag = z.enum(["true", "false"]).transform((v) => v === "true");

/** What the public search page may ask for. Unknown words are rejected rather than ignored. */
export const searchQuerySchema = z.strictObject({
  q: z.string().trim().max(80).optional(),
  department: csv(DEPARTMENTS).optional(),
  mode: csv(WORK_MODES).optional(),
  compensation: csv(COMPENSATION).optional(),
  maxWeeks: z.coerce.number().int().min(2).max(26).optional(),
  openToUnder18: flag.optional(),
  closingSoon: flag.optional(),
  startsBy: z.coerce.date().optional(),
  sort: z.enum(SORTS).default("newest"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(12),
});

/** The applicant's reusable details. Everything is optional text the person chooses to share. */
export const profileSchema = z.strictObject({
  headline: z.string().trim().max(100),
  educationLevel: z.enum(EDUCATION_LEVELS),
  institution: z.string().trim().max(120),
  field: z.string().trim().max(120),
  graduationYear: z.number().int().min(1990).max(2100).optional(),
  skills: z.array(tag(40)).max(15),
  links: linkList,
  about: z.string().trim().max(1000),
  availableFrom: z.coerce.date().optional(),
  hoursPerWeek: z.number().int().min(1).max(60).optional(),
});

/** A draft is saved while typing, so nothing is required yet. */
export const draftSchema = z.strictObject({
  statement: z.string().max(2000),
  links: z.array(z.string().trim().max(300)).max(5).default([]),
  answers: z.array(answerSchema).max(5).default([]),
  availableFrom: z.coerce.date().optional(),
});

export const alertSchema = z.strictObject({
  departments: z.array(z.enum(DEPARTMENTS)).max(10),
  modes: z.array(z.enum(WORK_MODES)).max(3),
  keywords: z.string().trim().max(60),
  active: z.boolean(),
});

export const applicationQuery = z.strictObject({
  sort: z.enum(["newest", "oldest", "match"]).optional(),
  /** Only applications still unread after this many days. */
  waitingDays: z.coerce.number().int().min(1).max(365).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  postingId: idLike.optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
});

export const placementQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(PLACEMENT_STATUSES).optional(),
  postingId: idLike.optional(),
  supervisorId: idLike.optional(),
});

export const interviewSchema = z.strictObject({
  at: z.coerce.date(),
  mode: z.enum(INTERVIEW_MODES),
  where: text(1, 200),
  note: z.string().trim().max(300).optional(),
});

export const bulkSchema = z.strictObject({
  ids: z.array(idLike).min(1).max(50),
  to: z.enum(STAFF_TARGETS as unknown as [string, ...string[]]),
  message: z.string().trim().max(500).optional(),
});

export const transitionSchema = z.strictObject({
  to: z.enum(STAFF_TARGETS as unknown as [string, ...string[]]),
  note: z.string().trim().max(1000).optional(),
  /** Time and place, when moving to the interview step. */
  interview: interviewSchema.optional(),
  /** Shown to the applicant. Keep it kind and short; never put reviewer opinions here. */
  message: z.string().trim().max(500).optional(),
});

export const noteSchema = z.strictObject({
  text: text(2, 1000),
  score: z.number().int().min(1).max(5).optional(),
});

export const placeSchema = z.strictObject({
  supervisorId: idLike,
  startsOn: z.coerce.date(),
  endsOn: z.coerce.date(),
});

export const endPlacementSchema = z.strictObject({
  status: z.enum(["completed", "ended_early", "cancelled"]),
  summary: z.string().trim().max(1000).optional(),
});

export const reassignSchema = z.strictObject({ supervisorId: idLike });

export const feedbackSchema = z.strictObject({
  text: text(5, 1500),
  rating: z.number().int().min(1).max(5).optional(),
  visibleToIntern: z.boolean().default(true),
});

export const slugParam = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{1,60}$/);
export const idParam = idLike;
