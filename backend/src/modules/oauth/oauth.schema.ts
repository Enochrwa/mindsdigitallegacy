import { z } from "zod";
import { isProviderId } from "./oauth.types.js";
import type { ProviderId } from "./oauth.types.js";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** The second step of a social sign-up: the same choices the email form asks for. */
export const completeSchema = z
  .strictObject({
    ageBracket: z.enum(["under_16", "16_plus"]),
    guardianEmail: email.optional(),
    consent: z.literal(true, "Consent to data processing is required"),
    privacyNoticeVersion: z.string().trim().min(1).max(20),
    referralCode: z.string().trim().max(20).optional(),
  })
  .refine((v) => v.ageBracket !== "under_16" || v.guardianEmail !== undefined, {
    path: ["guardianEmail"],
    message: "A guardian email is required for learners under 16",
  })
  .refine((v) => v.ageBracket !== "16_plus" || v.guardianEmail === undefined, {
    path: ["guardianEmail"],
    message: "Guardian details are only for learners under 16",
  });

export const codeSchema = z.strictObject({ code: z.string().trim().min(6).max(20) });

/** A provider name from the URL. Unknown names are a plain 404, never an error that explains what exists. */
export const providerParam = (raw: unknown): ProviderId | null => (isProviderId(raw) ? raw : null);
