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
    HOST: z.string().min(1).default("127.0.0.1"),
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
    /** Public URL of the web app, used in email links. Must be https in production. */
    WEB_BASE_URL: originSchema.default("http://localhost:8080"),
    /** Public auth endpoints (register, login, reset) per client IP per 15 minutes. */
    RATE_LIMIT_AUTH_PER_15MIN: z.coerce.number().int().min(1).default(20),
    /** Retention for contact and interest records. Confirm the final period with counsel. */
    LEAD_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(730),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (!env.MONGODB_URI) {
      ctx.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "required in production" });
    }
    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "required in production" });
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

export type Env = z.infer<typeof envSchema>;

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
  return result.data;
}
