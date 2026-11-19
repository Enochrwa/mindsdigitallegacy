import { createApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import { noBreachCheck } from "../core/security/breach.js";
import { createPasswordHasher } from "../core/security/password.js";
import { loadAcademyContentSync } from "../modules/courses/content.load.js";
import { createLogMailer } from "../modules/auth/mailer.js";
import { createSecretBox } from "../modules/admin/totp.js";
import { memoryGrowthDeps } from "./memory.growth.js";
import { memoryInternshipDeps } from "./memory.internships.js";
import { memoryOAuthIdentities } from "./memory.oauth.js";
import { PROVIDER_IDS, PROVIDER_LABEL } from "../modules/oauth/oauth.types.js";
import type { ProviderAdapter, ProviderId } from "../modules/oauth/oauth.types.js";
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
const DEV_TOTP_KEY = "dev-only-insecure-totp-key-change-me!";
const DEV_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

if (process.env["NODE_ENV"] === "production") {
  throw new Error("The in-memory dev server must never run in production.");
}
const env = loadEnv({
  NODE_ENV: "development",
  CORS_ORIGINS: process.env["CORS_ORIGINS"] ?? "http://localhost:3000",
  // Optional: lets browser tests run on 127.0.0.1 so cookies and the sign-in round trip stay on one host.
  ...(process.env["WEB_BASE_URL"] === undefined
    ? {}
    : { WEB_BASE_URL: process.env["WEB_BASE_URL"] }),
  ...(process.env["API_PUBLIC_URL"] === undefined
    ? {}
    : { API_PUBLIC_URL: process.env["API_PUBLIC_URL"] }),
  RATE_LIMIT_AUTH_PER_15MIN: "1000",
});
const logger = createLogger(env);
const catalogueData = buildCatalogueData(loadAcademyContentSync(), new Date());
const growth = memoryGrowthDeps(catalogueData);
const internshipDeps = memoryInternshipDeps();

/**
 * Pretend providers so the social sign-in screens can be tried with no keys and no internet. The "provider"
 * page is skipped: the browser goes straight back to the callback as a fixed demo person. Google, GitHub and
 * LinkedIn vouch for the email; Microsoft and Facebook do not, so they show the mailbox-code step (the code
 * is printed in this console by the log mailer). Never part of a real server (see server.ts).
 */
const devProviders = new Map<ProviderId, ProviderAdapter>(
  PROVIDER_IDS.map((id) => [
    id,
    {
      id,
      label: PROVIDER_LABEL[id],
      authorizeUrl: (p) => `${p.redirectUri}?code=dev&state=${encodeURIComponent(p.state)}`,
      exchange: () =>
        Promise.resolve({
          provider: id,
          subject: `dev-${id}-1`,
          email: `${id}.demo@example.rw`,
          emailVerified: id === "google" || id === "github" || id === "linkedin",
          name: `${PROVIDER_LABEL[id]} Demo`,
        }),
    },
  ]),
);
const users = memoryUsers();
const hasher = createPasswordHasher({ memoryKiB: 1024, passes: 1, parallelism: 1 });
const secretBox = createSecretBox(env.TOTP_ENCRYPTION_KEY ?? DEV_TOTP_KEY);
await seedDevAdmin();

async function seedDevAdmin(): Promise<void> {
  const email = "admin@example.rw";
  const password = "correct horse battery";
  const now = new Date();
  const created = await users.create({
    email,
    emailVerifiedAt: now,
    passwordHash: await hasher.hash(password),
    displayName: "Dev Admin",
    roles: ["learner", "admin"],
    ageBracket: "16_plus",
    consents: [],
    totp: {
      secretEnc: secretBox.seal(DEV_TOTP_SECRET),
      enabledAt: now,
      recoveryHashes: [],
    },
  });
  logger.warn(
    { email, password, totpSecret: DEV_TOTP_SECRET, id: created.id },
    "DEV ADMIN seeded (add the secret to an authenticator app, or compute codes in tests)",
  );
}

const app = createApp({
  env,
  logger,
  leadRepository: growth.leads,
  catalogueAdmin: growth.catalogueAdmin,
  leadAdmin: growth.leads,
  referrals: growth.referrals,
  ...internshipDeps,
  oauthProviders: devProviders,
  oauthIdentities: memoryOAuthIdentities(),
  entitlements: growth.entitlements,
  unlockCodes: growth.unlockCodes,
  settings: growth.settings,
  users,
  sessions: memorySessions(),
  authTokens: memoryAuthTokens(),
  audit: memoryAudit(),
  catalogue: memoryCatalogue(catalogueData),
  enrolments: memoryEnrolments(),
  progress: memoryProgress(),
  mailer: createLogMailer(logger, env.WEB_BASE_URL, false),
  hasher,
  breach: noBreachCheck,
  isDbReady: () => true,
});
app.listen(env.PORT, env.HOST, () => {
  logger.warn({ port: env.PORT }, "IN-MEMORY DEV API (not for production)");
});
