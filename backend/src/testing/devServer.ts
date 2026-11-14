import { createApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import { noBreachCheck } from "../core/security/breach.js";
import { createPasswordHasher } from "../core/security/password.js";
import { loadAcademyContentSync } from "../modules/courses/content.load.js";
import { createLogMailer } from "../modules/auth/mailer.js";
import {
  buildCatalogueData,
  memoryAudit,
  memoryAuthTokens,
  memoryCatalogue,
  memoryEnrolments,
  memoryProgress,
  memorySessions,
  memoryUsers,
} from "./memory.js";

/**
 * Development-only API with everything in memory: no MongoDB needed, data vanishes on restart.
 * Verification and reset links are printed to the console by the log mailer (dev mode).
 * Refuses to run in production and is excluded from the production build.
 */
if (process.env["NODE_ENV"] === "production") {
  throw new Error("The in-memory dev server must never run in production.");
}
const env = loadEnv({
  NODE_ENV: "development",
  CORS_ORIGINS: process.env["CORS_ORIGINS"] ?? "http://localhost:8080",
  RATE_LIMIT_AUTH_PER_15MIN: "1000",
});
const logger = createLogger(env);
const app = createApp({
  env,
  logger,
  leadRepository: { create: () => Promise.resolve() },
  users: memoryUsers(),
  sessions: memorySessions(),
  authTokens: memoryAuthTokens(),
  audit: memoryAudit(),
  catalogue: memoryCatalogue(buildCatalogueData(loadAcademyContentSync(), new Date())),
  enrolments: memoryEnrolments(),
  progress: memoryProgress(),
  mailer: createLogMailer(logger, env.WEB_BASE_URL, false),
  hasher: createPasswordHasher({ memoryKiB: 1024, passes: 1, parallelism: 1 }),
  breach: noBreachCheck,
  isDbReady: () => true,
});
app.listen(env.PORT, env.HOST, () => {
  logger.warn({ port: env.PORT }, "IN-MEMORY DEV API (not for production)");
});
