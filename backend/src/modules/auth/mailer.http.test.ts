import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../core/logger.js";
import { createHttpMailer } from "./mailer.http.js";
import { templates } from "./mailTemplates.js";

const logger = createLogger({ LOG_LEVEL: "silent", LOG_PRETTY: false });
const base = {
  apiKey: "secret-key-123456",
  fromEmail: "no-reply@example.rw",
  fromName: "MDL",
  webBaseUrl: "https://app.example.rw",
};
const ok = () => vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));

type Call = [string, { headers: Record<string, string>; body: string }];

describe("http mailer", () => {
  it("sends verification through Brevo with the api-key header and a token link", async () => {
    const fetchFn = ok();
    const mailer = createHttpMailer({ ...base, provider: "brevo" }, logger, fetchFn);
    await mailer.sendVerification("ada@example.rw", "tok_abc-123");
    const [url, init] = fetchFn.mock.calls[0] as Call;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe(base.apiKey);
    const body = JSON.parse(init.body) as {
      to: { email: string }[];
      htmlContent: string;
      sender: { email: string };
    };
    expect(body.to).toEqual([{ email: "ada@example.rw" }]);
    expect(body.sender.email).toBe("no-reply@example.rw");
    expect(body.htmlContent).toContain("https://app.example.rw/verify-email?token=tok_abc-123");
  });

  it("sends through Resend with a Bearer token", async () => {
    const fetchFn = ok();
    const mailer = createHttpMailer({ ...base, provider: "resend" }, logger, fetchFn);
    await mailer.sendPasswordReset("ada@example.rw", "tok_reset");
    const [url, init] = fetchFn.mock.calls[0] as Call;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Authorization"]).toBe(`Bearer ${base.apiKey}`);
    expect(JSON.parse(init.body)).toMatchObject({
      from: "MDL <no-reply@example.rw>",
      to: ["ada@example.rw"],
    });
  });

  it("never throws when the provider fails, and never logs tokens or addresses", async () => {
    const lines: string[] = [];
    const spyLogger = createLogger({ LOG_LEVEL: "error", LOG_PRETTY: false });
    spyLogger.error = (...args: unknown[]) => void lines.push(JSON.stringify(args));
    const failing = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const down = vi.fn().mockRejectedValue(new Error("tok_secret ada@example.rw"));
    for (const fetchFn of [failing, down]) {
      const mailer = createHttpMailer({ ...base, provider: "brevo" }, spyLogger, fetchFn);
      await expect(
        mailer.sendVerification("ada@example.rw", "tok_secret"),
      ).resolves.toBeUndefined();
    }
    expect(lines.length).toBe(2);
    expect(lines.join("")).not.toContain("tok_secret");
    expect(lines.join("")).not.toContain("ada@example.rw");
  });
});

describe("mail templates", () => {
  it("escapes the learner name in the guardian email", () => {
    const mail = templates.guardianConsent(
      '<script>alert("x")</script>',
      "https://app.example.rw/g?token=abc",
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
