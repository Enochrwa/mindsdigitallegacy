import { z } from "zod";
import { PASSWORD_MAX } from "../../core/security/passwordPolicy.js";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const token = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, "Invalid token");
/** Length is enforced here only as a DoS bound; the real policy runs in the service. */
const password = z.string().min(1).max(PASSWORD_MAX);

export const registerSchema = z
  .strictObject({
    email,
    password,
    displayName: z.string().trim().min(2).max(100),
    ageBracket: z.enum(["under_16", "16_plus"]),
    guardianEmail: email.optional(),
    consent: z.literal(true, "Consent to data processing is required"),
    privacyNoticeVersion: z.string().trim().min(1).max(20),
    /** From an invitation link. Unknown or invalid codes are ignored without telling the visitor. */
    referralCode: z.string().trim().max(20).optional(),
  })
  .refine((v) => v.ageBracket !== "under_16" || v.guardianEmail !== undefined, {
    path: ["guardianEmail"],
    message: "A guardian email is required for learners under 16",
  })
  .refine((v) => v.guardianEmail === undefined || v.guardianEmail !== v.email, {
    path: ["guardianEmail"],
    message: "The guardian email must differ from your own",
  });

export const tokenSchema = z.strictObject({ token });
export const loginSchema = z.strictObject({ email, password });
export const forgotSchema = z.strictObject({ email });
export const resetSchema = z.strictObject({ token, password });
export const consentUpdateSchema = z.strictObject({
  granted: z.boolean(),
  privacyNoticeVersion: z.string().trim().min(1).max(20),
});
/**
 * Deleting an account needs proof it is really the owner: the password, or for accounts that have none
 * (signed up with Google, GitHub...) typing the account's email address.
 */
export const deleteAccountSchema = z
  .strictObject({
    password: password.optional(),
    confirmEmail: z.string().trim().max(254).optional(),
  })
  .refine((v) => v.password !== undefined || v.confirmEmail !== undefined, {
    message: "Confirm with your password or your email address.",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
