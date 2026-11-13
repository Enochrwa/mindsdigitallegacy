import { pino } from "pino";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";

export type { Logger };

/**
 * Structured JSON logs. Credentials and cookies are redacted even if a future change logs a
 * whole request by mistake. Pretty printing is opt-in via LOG_PRETTY=true and must only be used
 * where dev dependencies are installed (pino-pretty), never in the production image.
 */
export function createLogger(env: Pick<Env, "LOG_LEVEL" | "LOG_PRETTY">): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: "mdl-api" },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        "*.password",
        "*.token",
        "*.email",
        "*.phone",
      ],
      censor: "[redacted]",
    },
    ...(env.LOG_PRETTY ? { transport: { target: "pino-pretty" } } : {}),
  });
}
