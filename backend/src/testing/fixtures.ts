import { createApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import type { NewLead } from "../modules/leads/leads.model.js";
import type { LeadRepository } from "../modules/leads/leads.repository.js";

/** Test-only helpers. Excluded from the production build (see tsconfig.build.json). */

export const ALLOWED_ORIGIN = "https://app.example.rw";

interface Options {
  env?: Record<string, string>;
  dbReady?: boolean;
  repository?: LeadRepository;
}

export function buildTestApp(options: Options = {}) {
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    CORS_ORIGINS: ALLOWED_ORIGIN,
    ...options.env,
  });
  const stored: NewLead[] = [];
  const repository: LeadRepository = options.repository ?? {
    create: (lead) => {
      stored.push(lead);
      return Promise.resolve();
    },
  };
  const app = createApp({
    env,
    logger: createLogger(env),
    leadRepository: repository,
    isDbReady: () => options.dbReady ?? true,
  });
  return { app, env, stored };
}

export const validContact = {
  kind: "contact",
  fullName: "Ada Uwase",
  email: "ada@example.rw",
  message: "I would like to know more about your training programmes.",
  consent: true,
  privacyNoticeVersion: "2026-11",
} as const;

export interface ErrorPayload {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}

/** Typed access to the error envelope (supertest types `res.body` as `any`). */
export function errorOf(res: { body: unknown }): ErrorPayload {
  return (res.body as { error: ErrorPayload }).error;
}
