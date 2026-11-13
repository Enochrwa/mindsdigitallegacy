import { z } from "zod";

/**
 * Public lead capture (contact, service requests, partner inquiries, course and internship interest).
 *
 * Rules enforced here:
 *  - strict objects: unknown fields are rejected, not silently stored;
 *  - explicit consent to processing is required (Law No. 058/2021) and the notice version is recorded;
 *  - applicants under 16 must provide a guardian contact (parent or guardian consent rule);
 *  - `website` is a honeypot: real users never see or fill it, bots do.
 *
 * Optional fields must be omitted by the client when empty (not sent as "").
 */

export const LEAD_KINDS = [
  "contact",
  "service_request",
  "partner_inquiry",
  "course_interest",
  "internship_interest",
] as const;

export const AGE_BRACKETS = ["under_16", "16_plus"] as const;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

const base = {
  fullName: text(2, 100),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()-]{5,19}$/, "Invalid phone number")
    .optional(),
  organization: text(1, 120).optional(),
  consent: z.literal(true, "Consent to data processing is required"),
  privacyNoticeVersion: text(1, 20),
  website: z.string().max(200).optional(),
};

const ageFields = {
  ageBracket: z.enum(AGE_BRACKETS),
  guardianContact: text(5, 150).optional(),
};

function requireGuardianWhenUnder16<T extends { ageBracket: string; guardianContact?: string }>(
  value: T,
): boolean {
  return value.ageBracket !== "under_16" || (value.guardianContact ?? "").length > 0;
}

const guardianMessage = {
  path: ["guardianContact"],
  message: "A parent or guardian contact is required for applicants under 16",
};

const contact = z.strictObject({
  kind: z.literal("contact"),
  ...base,
  message: text(10, 2000),
});

const serviceRequest = z.strictObject({
  kind: z.literal("service_request"),
  ...base,
  service: text(2, 100),
  budget: text(1, 50).optional(),
  message: text(10, 2000),
});

const partnerInquiry = z.strictObject({
  kind: z.literal("partner_inquiry"),
  ...base,
  partnerType: text(2, 60),
  message: text(10, 2000),
});

const courseInterest = z
  .strictObject({
    kind: z.literal("course_interest"),
    ...base,
    ...ageFields,
    interest: text(2, 100),
    message: text(1, 1000).optional(),
  })
  .refine(requireGuardianWhenUnder16, guardianMessage);

const internshipInterest = z
  .strictObject({
    kind: z.literal("internship_interest"),
    ...base,
    ...ageFields,
    interest: text(2, 100),
    message: text(1, 1000).optional(),
  })
  .refine(requireGuardianWhenUnder16, guardianMessage);

export const leadInputSchema = z.discriminatedUnion("kind", [
  contact,
  serviceRequest,
  partnerInquiry,
  courseInterest,
  internshipInterest,
]);

export type LeadInput = z.infer<typeof leadInputSchema>;
export type LeadKind = (typeof LEAD_KINDS)[number];
