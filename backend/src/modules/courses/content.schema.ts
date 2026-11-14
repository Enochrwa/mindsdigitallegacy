import { z } from "zod";
import {
  COURSE_LEVELS,
  COURSE_STATUSES,
  LANGUAGES,
  LESSON_KINDS,
  LESSON_STATUSES,
  SLUG_PATTERN,
  YOUTUBE_ID_PATTERN,
} from "./courses.types.js";

/**
 * Authoring format for academy content (backend/content/academy.json).
 * Strict on purpose: a typo in a field name fails the import instead of silently being ignored.
 * Business rules that span fields live in content.validate.ts.
 */
const slug = z
  .string()
  .regex(SLUG_PATTERN, "Use lower-case words separated by hyphens")
  .min(2)
  .max(80);
const text = (max: number) => z.string().trim().min(1).max(max);

const block = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("heading"), text: text(120) }),
  z.strictObject({ type: z.literal("paragraph"), text: text(2000) }),
  z.strictObject({
    type: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(text(400)).min(1).max(30),
  }),
  z.strictObject({ type: z.literal("note"), text: text(600) }),
  z.strictObject({ type: z.literal("code"), language: text(20), text: text(4000) }),
]);

const resource = z.strictObject({
  title: text(120),
  url: z.url().refine((u) => u.startsWith("https://"), "Resources must use https"),
  kind: z.enum(["link", "download"]),
});

const lesson = z.strictObject({
  slug,
  title: text(120),
  summary: text(240),
  kind: z.enum(LESSON_KINDS),
  status: z.enum(LESSON_STATUSES),
  required: z.boolean().default(true),
  isPreview: z.boolean().default(false),
  video: z
    .strictObject({
      videoId: z.string().regex(YOUTUBE_ID_PATTERN, "A YouTube video id has 11 characters"),
      durationSec: z
        .number()
        .int()
        .min(1)
        .max(4 * 60 * 60),
    })
    .optional(),
  body: z.array(block).max(60).default([]),
  transcript: z
    .strictObject({ language: z.enum(LANGUAGES), paragraphs: z.array(text(2000)).min(1).max(500) })
    .optional(),
  resources: z.array(resource).max(20).default([]),
});

const section = z.strictObject({
  title: text(120),
  summary: text(240).optional(),
  lessons: z.array(lesson).min(1).max(60),
});

const unlockPolicy = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("open") }),
  z.strictObject({ type: z.literal("referral"), threshold: z.number().int().min(1).max(50) }),
  z.strictObject({ type: z.literal("code") }),
]);

const course = z.strictObject({
  slug,
  categorySlug: slug,
  title: text(100),
  summary: text(200),
  description: z.array(block).min(1).max(20),
  level: z.enum(COURSE_LEVELS),
  language: z.enum(LANGUAGES),
  status: z.enum(COURSE_STATUSES),
  order: z.number().int().min(0).max(10_000),
  tags: z.array(slug).max(10).default([]),
  outcomes: z.array(text(160)).min(1).max(10),
  audience: text(200),
  prerequisites: z.array(slug).max(5).default([]),
  instructors: z
    .array(z.strictObject({ name: text(80), title: text(80) }))
    .min(1)
    .max(5),
  unlockPolicy,
  sections: z.array(section).min(1).max(30),
});

const category = z.strictObject({
  slug,
  name: text(80),
  description: text(240),
  order: z.number().int().min(0).max(1000),
  visible: z.boolean().default(true),
});

export const academyContentSchema = z.strictObject({
  categories: z.array(category).min(1).max(50),
  courses: z.array(course).max(200),
});

export type AcademyContent = z.infer<typeof academyContentSchema>;
export type CourseContent = AcademyContent["courses"][number];
