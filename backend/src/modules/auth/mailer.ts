import type { Logger } from "../../core/logger.js";

/**
 * Email port. No provider is chosen yet (Sprint 1 founder decision, see sprint plan), so the only
 * implementation logs. In development the link is logged so flows can be tried locally. In
 * production nothing containing a token is ever logged: the process warns that no provider is set.
 */
export interface Mailer {
  sendVerification(to: string, token: string): Promise<void>;
  sendPasswordReset(to: string, token: string): Promise<void>;
  sendGuardianConsent(guardianEmail: string, learnerName: string, token: string): Promise<void>;
  /** Sent instead of a verification mail when someone registers an address that already has an account. */
  sendExistingAccountNotice(to: string): Promise<void>;
  /** One-time code that proves the person controls the mailbox, for sign-in providers that do not vouch for it. */
  sendSignInCode(to: string, name: string, code: string): Promise<void>;
  /** Fixed-text status mail about an internship application. Links to the signed-in page, never carries details. */
  sendInternshipUpdate(
    to: string,
    name: string,
    postingTitle: string,
    kind: InternshipMail,
  ): Promise<void>;
}

/** Programme updates an applicant receives. The text is fixed, so nothing a reviewer types is ever emailed. */
export type InternshipMail =
  "received" | "shortlisted" | "interview" | "offered" | "rejected" | "placed";

export function createLogMailer(logger: Logger, webBaseUrl: string, production: boolean): Mailer {
  const emit = (kind: string, path?: string): Promise<void> => {
    if (production) {
      logger.warn({ kind }, "email not sent: no email provider configured");
    } else {
      logger.info(
        { kind, link: path === undefined ? undefined : `${webBaseUrl}${path}` },
        "dev email",
      );
    }
    return Promise.resolve();
  };
  return {
    sendVerification: (_to, token) => emit("verify_email", `/verify-email?token=${token}`),
    sendPasswordReset: (_to, token) => emit("reset_password", `/reset-password?token=${token}`),
    sendGuardianConsent: (_to, _name, token) =>
      emit("guardian_consent", `/guardian-consent?token=${token}`),
    sendExistingAccountNotice: () => emit("existing_account"),
    sendSignInCode: () => emit("signin_code"),
    sendInternshipUpdate: (_to, _name, _title, kind) =>
      emit(`internship_${kind}`, "/account/internships"),
  };
}
