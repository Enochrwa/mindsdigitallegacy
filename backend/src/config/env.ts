import { z } from "zod";

/**
 * Environment configuration. Parsed once at start-up; the process refuses to boot on invalid
 * config (fail fast). Error messages name the variable but never print its value, so a
 * mistyped secret cannot leak into logs.
 */

function csv(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Accepts only a bare http(s) origin, e.g. https://example.rw (no path, no trailing slash). */
function isBareHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

const originSchema = z
  .string()
  .refine(isBareHttpOrigin, "must be a bare http(s) origin such as https://example.rw");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Interface to listen on. Default: 127.0.0.1 in development, 0.0.0.0 in production (hosts such as Render must reach it). */
    HOST: z.string().min(1).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    /** Human-readable logs for local development only. Needs the dev dependency pino-pretty. */
    LOG_PRETTY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://")
      .optional(),
    /** Comma-separated browser origins allowed to call the API. No wildcards, ever. */
    CORS_ORIGINS: z.string().default("").transform(csv).pipe(z.array(originSchema)),
    /** Number of reverse proxies in front of the API. Wrong values make IP rate limits spoofable. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    BODY_LIMIT_KB: z.coerce.number().int().min(1).max(256).default(16),
    RATE_LIMIT_GENERAL_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    RATE_LIMIT_LEADS_PER_HOUR: z.coerce.number().int().min(1).default(20),
    /** Learning writes (enrol, progress) per client IP per minute. */
    RATE_LIMIT_LEARNING_PER_MINUTE: z.coerce.number().int().min(1).default(90),
    /** Public URL of the web app, used in email links. Must be https in production. */
    WEB_BASE_URL: originSchema.default("http://localhost:3000"),
    /** Public auth endpoints (register, login, reset) per client IP per 15 minutes. */
    RATE_LIMIT_AUTH_PER_15MIN: z.coerce.number().int().min(1).default(20),
    /** `log` only logs (development). `brevo` or `resend` send real mail (docs/06-third-party-providers.md). */
    EMAIL_PROVIDER: z.enum(["log", "brevo", "resend"]).default("log"),
    EMAIL_API_KEY: z.string().min(10).optional(),
    EMAIL_FROM: z.email().optional(),
    EMAIL_FROM_NAME: z.string().min(1).max(60).default("Minds Digital Legacy"),
    /** Checks new passwords against the Have I Been Pwned range API (fails open if unreachable). */
    PASSWORD_BREACH_CHECK: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    /** Retention for contact and interest records. Confirm the final period with counsel. */
    /** Encrypts staff authenticator secrets at rest. Required in production; generate with `openssl rand -base64 32`. */
    TOTP_ENCRYPTION_KEY: z.string().min(32).optional(),
    LEAD_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(730),
    /** How many interns one supervisor may guide at once. Caps how many slots a posting may offer. */
    INTERNSHIP_MAX_PER_SUPERVISOR: z.coerce.number().int().min(1).max(10).default(3),
    /** Public address of THIS API (where providers send people back). Defaults to http://localhost:PORT for development. */
    API_PUBLIC_URL: originSchema.optional(),
    /** Seals the sign-in state and half-finished sign-ups in cookies. 32+ characters; `openssl rand -base64 32`. */
    OAUTH_STATE_KEY: z.string().min(32).max(200).optional(),
    OAUTH_GOOGLE_CLIENT_ID: z.string().min(1).max(300).optional(),
    OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).max(500).optional(),
    OAUTH_MICROSOFT_CLIENT_ID: z.string().min(1).max(300).optional(),
    OAUTH_MICROSOFT_CLIENT_SECRET: z.string().min(1).max(500).optional(),
    OAUTH_GITHUB_CLIENT_ID: z.string().min(1).max(300).optional(),
    OAUTH_GITHUB_CLIENT_SECRET: z.string().min(1).max(500).optional(),
    OAUTH_FACEBOOK_CLIENT_ID: z.string().min(1).max(300).optional(),
    OAUTH_FACEBOOK_CLIENT_SECRET: z.string().min(1).max(500).optional(),
    OAUTH_LINKEDIN_CLIENT_ID: z.string().min(1).max(300).optional(),
    OAUTH_LINKEDIN_CLIENT_SECRET: z.string().min(1).max(500).optional(),
    /** "common" (work, school and personal), "organizations", "consumers", or one tenant id. */
    OAUTH_MICROSOFT_TENANT: z
      .string()
      .regex(
        /^(common|organizations|consumers|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
      )
      .default("common"),
    /** Facebook Graph API version, for example v25.0. */
    OAUTH_FACEBOOK_GRAPH_VERSION: z
      .string()
      .regex(/^v\d{1,2}\.\d$/)
      .default("v25.0"),
    /** Per-client cap on browser CSP violation reports. */
    RATE_LIMIT_CSP_REPORTS_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(30),
    /** Days between an account deletion request and permanent removal of its data. Confirm with counsel. */
    ACCOUNT_PURGE_GRACE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    /** Minutes between in-process purge runs. 0 disables the timer (use `npm run purge:accounts` from cron). */
    ACCOUNT_PURGE_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(60),
  })
  .superRefine((env, ctx) => {
    // A provider needs both halves of its keys, or neither. Half-configured is always a mistake.
    for (const name of ["GOOGLE", "MICROSOFT", "GITHUB", "FACEBOOK", "LINKEDIN"] as const) {
      const id = env[`OAUTH_${name}_CLIENT_ID`];
      const secret = env[`OAUTH_${name}_CLIENT_SECRET`];
      if ((id === undefined) !== (secret === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: [`OAUTH_${name}_CLIENT_ID`],
          message: `OAUTH_${name}_CLIENT_ID and OAUTH_${name}_CLIENT_SECRET must be set together`,
        });
      }
    }
    if (env.NODE_ENV !== "production") return;
    const anyProvider = (["GOOGLE", "MICROSOFT", "GITHUB", "FACEBOOK", "LINKEDIN"] as const).some(
      (n) => env[`OAUTH_${n}_CLIENT_ID`] !== undefined,
    );
    if (anyProvider && !env.OAUTH_STATE_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OAUTH_STATE_KEY"],
        message: "required in production when a sign-in provider is enabled",
      });
    }
    if (anyProvider && !env.API_PUBLIC_URL?.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["API_PUBLIC_URL"],
        message:
          "must be set to the public https address of the API when a sign-in provider is enabled",
      });
    }
    if (!env.MONGODB_URI) {
      ctx.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "required in production" });
    }
    if (!env.TOTP_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["TOTP_ENCRYPTION_KEY"],
        message: "required in production (staff second factor)",
      });
    }
    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "required in production" });
    }
    if (env.EMAIL_PROVIDER !== "log" && (!env.EMAIL_API_KEY || !env.EMAIL_FROM)) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_API_KEY"],
        message: "EMAIL_API_KEY and EMAIL_FROM are required for the chosen provider",
      });
    }
    if (!env.WEB_BASE_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_BASE_URL"],
        message: "must use https in production",
      });
    }
    if (env.CORS_ORIGINS.some((origin) => !origin.startsWith("https://"))) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "every origin must use https in production",
      });
    }
  });

/** HOST is always a real address once loaded: see loadEnv. */
export type Env = Omit<z.infer<typeof envSchema>, "HOST"> & { HOST: string };

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // Treat empty strings as "not set" so `FOO=` in a .env file falls back to the default.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(env)"}: ${issue.message}`),
    );
  }
  // The listening interface depends on the mode: private on a laptop, open to the platform's proxy in production.
  return {
    ...result.data,
    HOST: result.data.HOST ?? (result.data.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  };
}
