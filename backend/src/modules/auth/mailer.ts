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
}

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
  };
}
