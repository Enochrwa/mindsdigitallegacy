import { createApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import type { NewLead } from "../modules/leads/leads.model.js";
import type { LeadRepository } from "../modules/leads/leads.repository.js";
import { noBreachCheck } from "../core/security/breach.js";
import type { BreachChecker } from "../core/security/breach.js";
import { createPasswordHasher } from "../core/security/password.js";
import { loadAcademyContentSync } from "../modules/courses/content.load.js";
import {
  buildCatalogueData,
  memoryCatalogue,
  memoryEnrolments,
  memoryProgress,
  memoryAudit,
  memoryAuthTokens,
  memoryMailer,
  memorySessions,
  memoryUsers,
} from "./memory.js";

/** Test-only helpers. Excluded from the production build (see tsconfig.build.json). */

export const ALLOWED_ORIGIN = "https://app.example.rw";

interface Options {
  env?: Record<string, string>;
  dbReady?: boolean;
  repository?: LeadRepository;
  now?: () => Date;
  breach?: BreachChecker;
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
  const users = memoryUsers();
  const sessions = memorySessions();
  const audit = memoryAudit();
  const mailer = memoryMailer();
  const enrolmentRepo = memoryEnrolments();
  const progressRepo = memoryProgress();
  const app = createApp({
    env,
    logger: createLogger(env),
    leadRepository: repository,
    users,
    sessions,
    authTokens: memoryAuthTokens(),
    audit,
    catalogue: memoryCatalogue(
      buildCatalogueData(loadAcademyContentSync(), new Date("2026-11-01T00:00:00Z")),
    ),
    enrolments: enrolmentRepo,
    progress: progressRepo,
    mailer,
    // Cheap parameters keep tests fast; production uses DEFAULT_ARGON2.
    hasher: createPasswordHasher({ memoryKiB: 64, passes: 1, parallelism: 1 }),
    breach: options.breach ?? noBreachCheck,
    ...(options.now === undefined ? {} : { now: options.now }),
    isDbReady: () => options.dbReady ?? true,
  });
  return {
    app,
    env,
    stored,
    users,
    sessions,
    audit,
    mailer,
    enrolments: enrolmentRepo,
    progress: progressRepo,
  };
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
