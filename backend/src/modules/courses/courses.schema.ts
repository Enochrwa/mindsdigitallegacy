import { z } from "zod";
import { COURSE_LEVELS, LANGUAGES, SLUG_PATTERN } from "./courses.types.js";

export const slugParam = z.string().regex(SLUG_PATTERN).max(80);

export const catalogueQuerySchema = z
  .object({
    category: slugParam.optional(),
    level: z.enum(COURSE_LEVELS).optional(),
    language: z.enum(LANGUAGES).optional(),
    tag: slugParam.optional(),
  })
  .strict();

export const progressBodySchema = z
  .object({
    completed: z.boolean().optional(),
    positionSec: z.number().int().min(0).max(86_400).optional(),
  })
  .strict()
  .refine((v) => v.completed !== undefined || v.positionSec !== undefined, {
    message: "Provide completed or positionSec.",
  });
