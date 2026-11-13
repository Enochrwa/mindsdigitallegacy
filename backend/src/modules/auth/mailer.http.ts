import type { Logger } from "../../core/logger.js";
import { templates } from "./mailTemplates.js";
import type { Mail } from "./mailTemplates.js";
import type { Mailer } from "./mailer.js";

/**
 * Email through a provider's HTTPS API. Two providers are supported (see docs/06-third-party-providers.md):
 * Brevo (free: 300/day) and Resend. Only the request shape differs, so one small function each.
 *
 * Failures are logged WITHOUT addresses or tokens and never thrown: a provider outage must not turn
 * registration or password reset into an error that reveals whether an address exists.
 * The request shapes follow each provider's documented send endpoint but have not been exercised against
 * the live services from this environment: send a real test mail before launch.
 */
export interface HttpMailerConfig {
  provider: "brevo" | "resend";
  apiKey: string;
  fromEmail: string;
  fromName: string;
  webBaseUrl: string;
}

type Send = (to: string, mail: Mail) => Promise<Response>;

function senders(
  config: HttpMailerConfig,
  fetchFn: typeof fetch,
): Record<HttpMailerConfig["provider"], Send> {
  const signal = (): AbortSignal => AbortSignal.timeout(10_000);
  return {
    brevo: (to, mail) =>
      fetchFn("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": config.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: config.fromName, email: config.fromEmail },
          to: [{ email: to }],
          subject: mail.subject,
          htmlContent: mail.html,
          textContent: mail.text,
        }),
        signal: signal(),
      }),
    resend: (to, mail) =>
      fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${config.fromName} <${config.fromEmail}>`,
          to: [to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
        signal: signal(),
      }),
  };
}

export function createHttpMailer(
  config: HttpMailerConfig,
  logger: Logger,
  fetchFn: typeof fetch = fetch,
): Mailer {
  const send = senders(config, fetchFn)[config.provider];
  const link = (path: string, token: string): string =>
    `${config.webBaseUrl}${path}?token=${encodeURIComponent(token)}`;

  async function deliver(kind: string, to: string, mail: Mail): Promise<void> {
    try {
      const response = await send(to, mail);
      if (!response.ok)
        logger.error(
          { kind, provider: config.provider, status: response.status },
          "email send failed",
        );
    } catch {
      logger.error({ kind, provider: config.provider }, "email send failed: provider unreachable");
    }
  }

  return {
    sendVerification: (to, token) =>
      deliver("verify_email", to, templates.verifyEmail(link("/verify-email", token))),
    sendPasswordReset: (to, token) =>
      deliver("reset_password", to, templates.resetPassword(link("/reset-password", token))),
    sendGuardianConsent: (to, name, token) =>
      deliver(
        "guardian_consent",
        to,
        templates.guardianConsent(name, link("/guardian-consent", token)),
      ),
    sendExistingAccountNotice: (to) => deliver("existing_account", to, templates.existingAccount()),
  };
}
