import { z } from "zod";
import {
  APPLICATION_STATUSES,
  COMPENSATION,
  DEPARTMENTS,
  PLACEMENT_STATUSES,
  POSTING_STATUSES,
  WORK_MODES,
} from "./internships.types.js";
import { cleanLink, STAFF_TARGETS } from "./internships.rules.js";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const idLike = z.string().trim().min(1).max(40);
const list = (min: number, max: number, itemMax: number) =>
  z.array(text(3, itemMax)).min(min).max(max);

/** Public application form. Strict: unknown fields are rejected, so nothing unexpected is stored. */
export const applySchema = z.strictObject({
  statement: text(50, 2000),
  links: z
    .array(z.string().trim().max(300))
    .max(5)
    .default([])
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
    }),
  availableFrom: z.coerce.date().optional(),
  under18: z.boolean(),
  guardian: z
    .strictObject({
      name: text(2, 100),
      relationship: text(2, 50),
      contact: text(5, 150),
    })
    .optional(),
  consent: z.literal(true, { error: "You must accept the privacy notice to apply." }),
  privacyNoticeVersion: text(1, 40),
});

export const acceptSchema = z.strictObject({ agreementVersion: text(1, 40) });

const postingFields = {
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
  compensationNote: z.string().trim().max(300).default(""),
  minAge: z.union([z.literal(16), z.literal(18)]),
  slots: z.number().int().min(1).max(20),
  supervisorIds: z.array(idLike).max(10).default([]),
  opensAt: z.coerce.date().optional(),
  closesAt: z.coerce.date().optional(),
};

const datesOrdered = (v: { opensAt?: Date | undefined; closesAt?: Date | undefined }): boolean =>
  v.opensAt === undefined || v.closesAt === undefined || v.closesAt > v.opensAt;
const datesMessage = {
  message: "The closing date must be after the opening date.",
  path: ["closesAt"],
};

export const postingCreateSchema = z.strictObject(postingFields).refine(datesOrdered, datesMessage);
export const postingPatchSchema = z
  .strictObject(postingFields)
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

export const applicationQuery = z.strictObject({
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

export const transitionSchema = z.strictObject({
  to: z.enum(STAFF_TARGETS as unknown as [string, ...string[]]),
  note: z.string().trim().max(1000).optional(),
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
