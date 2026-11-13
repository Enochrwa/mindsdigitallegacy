# 03 — Low-Level Design (LLD)

> Status: **Draft v0.1** · 2026-11-13 · Builds on `02-hld.md` and ADR-0001 to 0007.
> Sections marked **(built)** exist in code today. Everything else is design for the sprints in `05-sprint-plan.md`.

## 1. Repository layout

```
frontend/                  Frontend (TanStack Start, React 19, Tailwind, shadcn/ui). (built)
  src/routes/              File-based routes: home, about, academy, internships, services, ...
  src/components/site/     Site components (LeadForm, ...)
backend/                   API (built: foundation + leads)
  src/server.ts            Bootstrap, timeouts, graceful shutdown
  src/app.ts               createApp(deps); middleware order is part of the security design
  src/config/env.ts        Zod-validated environment
  src/core/                errors, logger, http/{security,rateLimit,requireJson,rejectUnsafeKeys,...}
  src/db/connect.ts        Mongo connection
  src/modules/<context>/   schema, model, repository, service, routes, tests
docs/                      Research, HLD, LLD, security, sprint plan, ADRs
.github/                   Workflows, Dependabot, CODEOWNERS, PR template
```

Module rule: routes call services, services call repository interfaces, repositories own Mongoose
models. A module never imports another module's model; it calls that module's service.

## 2. API conventions (built)

- Base path `/api/v1`. JSON only (`Content-Type: application/json`), 16 KB body limit by default.
- Errors: `{ "error": { "code", "message", "requestId", "details?" } }`. `details` appears only for
  validation errors, as `{ path, message }` pairs, and never contains submitted values.
- Every response carries `X-Request-Id` and `Cache-Control: no-store`.
- Status codes: 400 validation or malformed; 401 not authenticated; 403 forbidden or bad origin;
  404 not found (also used instead of 403 when revealing existence would leak data); 409 conflict;
  413 too large; 415 wrong content type; 429 rate limited; 500 generic; 503 not ready.
- Pagination (later): `?limit=` (max 50) and an opaque `cursor`. No offset pagination on large collections.
- Idempotency: public POSTs that must not double-submit accept an `Idempotency-Key` header (Sprint 4).

## 3. Data model

All collections use `timestamps` and `versionKey: false`. IDs are Mongo ObjectIds internally; public
identifiers (referral codes, certificate IDs) are separate random values so internal IDs are never exposed.
PII is marked **(PII)**.

### `leads` (built)

| Field                                                    | Type                                   | Notes                                                                           |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| kind                                                     | enum                                   | contact, service_request, partner_inquiry, course_interest, internship_interest |
| fullName, email **(PII)**, phone **(PII)**, organization | string                                 | email lower-cased                                                               |
| message, service, budget, partnerType, interest          | string                                 | kind-specific, length-capped                                                    |
| ageBracket, guardianContact **(PII)**                    | enum, string                           | guardian required when under_16                                                 |
| consent                                                  | `{ privacyNoticeVersion, acceptedAt }` | required                                                                        |
| status                                                   | enum                                   | new, contacted, closed                                                          |
| retainUntil                                              | date                                   | **TTL index** (expireAfterSeconds 0): records delete themselves                 |

Indexes: `createdAt`, `{kind,status,createdAt}`, `{email,createdAt}`, TTL on `retainUntil`.

### `users` (Sprint 1)

| Field                                                 | Notes                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| email **(PII)**                                       | unique, lower-cased; verified flag and `emailVerifiedAt`                                                             |
| passwordHash                                          | argon2id; never selected by default (`select: false`)                                                                |
| displayName **(PII)**, phone **(PII, optional)**      |                                                                                                                      |
| roles                                                 | subset of learner, intern, supervisor, admin. Never writable from public endpoints                                   |
| ageBracket, guardian `{ contact, consentAt, method }` | under-16 learners are inactive until guardian consent is recorded                                                    |
| consents                                              | array of `{ type: service \| marketing, noticeVersion, at, withdrawnAt? }`; marketing is separate and off by default |
| failedLogins, lockedUntil                             | throttling state                                                                                                     |
| totp `{ secretEnc, enabledAt }`                       | admins only; secret encrypted with an app-level key                                                                  |
| deletedAt                                             | soft-delete marker; a purge job removes data after the grace period                                                  |

### `sessions` (Sprint 1)

`{ userId, tokenHash, family, rotatedFrom?, createdAt, lastUsedAt, expiresAt, userAgentSummary, ipPrefix }`.
Only the **hash** of the session ID is stored. TTL index on `expiresAt`. Reuse of a rotated ID revokes the family.

### `auditEvents` (Sprint 1, append-only)

`{ at, actorId?, actorRole?, action, targetType?, targetId?, requestId, ipPrefix, outcome, meta? }`.
`meta` is a small allow-listed object, never free-form request data. Application code has no update or
delete path; a separate retention job removes events older than the policy period.

### `courses`, `lessons`, `enrollments`, `progress` (Sprint 2)

- `courses`: `{ slug, title, summary, level, language, status: draft|published, unlockPolicy, order }`
- `lessons`: `{ courseId, order, title, youtubeVideoId, durationSec, transcript?, resources[] }`.
  `youtubeVideoId` matches `/^[A-Za-z0-9_-]{11}$/` and is never returned unless the caller is unlocked.
- `enrollments`: `{ userId, courseId, state: locked|unlocked|completed, unlockedAt?, unlockedVia }`, unique `{userId,courseId}`.
- `progress`: `{ userId, lessonId, completedAt }`, unique `{userId,lessonId}`.

### `referralCodes`, `referralEvents` (Sprint 3)

- `referralCodes`: `{ userId, code, createdAt }`. The code is 10 characters from a 32-symbol alphabet
  (about 50 bits), unique, with no ambiguous characters.
- `referralEvents`: `{ codeId, referrerId, inviteeId, state: pending|verified|rejected, rejectReason?, createdAt, verifiedAt? }`,
  unique on `inviteeId` so a person can only ever be counted once.

### `internshipPostings`, `applications`, `placements` (Sprint 4)

- `internshipPostings`: `{ title, department, description, requirements, capacity, supervisorId?, status, opensAt, closesAt }`
- `applications`: `{ postingId, userId, statement, links[], state: submitted|reviewing|interview|offered|accepted|declined|withdrawn, notes? }`; unique `{postingId,userId}`.
  Reviewer notes are visible to admins only.
- `placements`: `{ applicationId, supervisorId, startsOn, endsOn, agreementVersion, agreedAt, status }`.
  A placement cannot be created without a supervisor (proposal rule: no supervisor, no intern).

## 4. Authentication and authorisation (Sprint 1, ADR-0004)

**Registration:** validate → rate limit → create user (unverified) → send verification link containing a
random 256-bit token (only its hash stored, expires in 24 h, single use) → respond with the same generic
message whether or not the email already exists. If it exists, the existing owner is notified by email instead.

**Login:** per-account and per-IP throttle with exponential backoff; identical response and timing for
"no such user" and "wrong password" (always hash against a dummy when the user is missing); on success, rotate
the session and set the cookie. Admins must complete TOTP before the session is marked `admin-verified`.

**Session cookie:** `__Host-mdl_sid` where the domain allows, else `mdl_sid`; `HttpOnly; Secure; SameSite=Lax; Path=/`;
idle timeout 30 days for learners, 12 hours and absolute 7 days for admins.

**Password policy:** minimum 10 characters, checked against a common-password list (no composition rules),
argon2id with parameters tuned to about 100 ms on the production host. Reset links behave like verification tokens
and revoke all other sessions on use.

**Authorisation:** a single `authorize(action, subject)` policy function, deny by default. Route handlers
never check roles inline. Object-level checks (a learner can only read their own progress) live in services,
and each is covered by a test that attempts access with another user's ID (an IDOR test).

## 5. Frontend design

**Stack:** TanStack Start (React 19), file routes, Tailwind, shadcn/ui, Zod for form schemas shared in shape with the API.

**Data access:** one typed API client (`src/lib/api.ts`) with `credentials: "include"`, a base URL from
`VITE_API_BASE_URL`, a 10-second timeout, and mapping of the error envelope to typed errors. No other
`fetch` calls in components. Server state through TanStack Query (cache, retries off for mutations).

**Forms:** one `LeadForm` reused across kinds. It renders the consent checkbox with a link to the privacy
notice, a visually hidden honeypot field (`tabIndex=-1`, `aria-hidden`, `autoComplete="off"`), asks the age bracket on
learner and intern forms, and omits empty optional fields before sending. Success and failure states are announced
to assistive technology.

**Video lesson page:** thumbnail facade from `https://i.ytimg.com/vi/<id>/hqdefault.jpg`, a labelled play
button, iframe created on activation with
`src="https://www.youtube-nocookie.com/embed/<id>?rel=0&modestbranding=1"`,
`title`, `allow="encrypted-media; picture-in-picture"`, `allowfullscreen`, `loading="lazy"`,
`referrerpolicy="strict-origin-when-cross-origin"`. The ID is validated against the 11-character pattern before
use. A "Watch on YouTube" fallback link and a transcript sit under the player.

**Web app response headers** (set at the edge or in the Worker, to be implemented in Sprint 0/2):
`Content-Security-Policy` with `default-src 'self'`, `frame-src https://www.youtube-nocookie.com`,
`img-src 'self' https://i.ytimg.com data:`, `connect-src 'self' <api-origin>`, `object-src 'none'`,
`base-uri 'self'`, `frame-ancestors 'none'`; plus `X-Content-Type-Options`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, payment off),
and HSTS. A nonce-based script policy is the target; confirm against what the framework emits before enforcing.
Start in `Content-Security-Policy-Report-Only` for one sprint.

**Design direction ("breathtaking"):** performance is part of the experience on low-data phones. Rich
motion and visuals must respect `prefers-reduced-motion`, load lazily, and stay inside the page budget in the HLD.
Concrete design tokens, type scale, and motion rules are a Sprint 5 deliverable with the founders' brand
colours; the existing styling is the starting point.

## 6. Referral algorithm (Sprint 3, ADR-0002)

```
on GET /r/:code        -> set short-lived attribution cookie (code, 30 days); redirect to /join
on registration        -> if cookie present and code valid: create referralEvent(pending) for the new user
on email verification  -> run checks; if all pass: state=verified, else state=rejected(reason)
unlock check           -> if count(verified events for referrer) >= threshold: enrolment state=unlocked
```

Checks at verification time: invitee ≠ referrer; invitee email domain is not on the disposable list;
invitee email and phone differ from the referrer's; no more than N verified events from one IP prefix per
day for one code (default 3); the invitee account is older than 60 seconds and has loaded at least one page after
registration; the referrer is not suspended. A rejected event keeps its reason for admin review and is never
shown to the referrer in detail (no feedback loop for attackers).

The threshold, the per-network cap, and the disposable-domain list are configuration. Admin screen shows
funnel: link opens, registrations, verifications, unlocks, rejections by reason.

Sharing UI: copy link, and platform share links built client-side
(`https://wa.me/?text=`, `https://www.linkedin.com/sharing/share-offsite/?url=`, `https://twitter.com/intent/tweet?text=&url=`,
Facebook sharer). Instagram has no web share link, so the UI offers "copy link" with instructions. MDL never
reads contacts and never sends messages on a user's behalf.

## 7. Background jobs (Sprint 3 onward)

Run in the API process at first (single instance), behind an interface so they can move to a worker:
purge soft-deleted users after the grace period, expire unverified registrations after 7 days, send reminder
emails for pending guardian consent, reconcile pending payments (later), and produce the weekly funnel digest.
Each job is idempotent and logs counts, not personal data.

## 8. Testing strategy

| Layer         | Tool                                                                        | Rule                                                                                                        |
| ------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unit          | Vitest                                                                      | Pure functions (validation, referral checks, policy)                                                        |
| HTTP          | Vitest + Supertest against the real middleware stack with fake repositories | Every security control has a test that fails when the control is removed (verified by mutation in Sprint 0) |
| Model         | Vitest, no database                                                         | Schema validation, index definitions                                                                        |
| Integration   | Vitest against a throwaway MongoDB in CI (service container)                | Unique indexes, TTL index presence, transactions, query behaviour. **Added in Sprint 1**; not present today |
| End to end    | Playwright                                                                  | Register, verify, unlock, watch, apply. Added in Sprint 5                                                   |
| Accessibility | axe in Playwright                                                           | No serious violations on key pages                                                                          |
| Security      | `npm audit`, CodeQL, gitleaks, dependency review                            | On every PR                                                                                                 |

## 9. Configuration reference (built)

See `backend/.env.example`. All values are validated at start-up (`config/env.ts`). Production refuses to start
without `MONGODB_URI` and an https-only `CORS_ORIGINS`.

## 10. Known limits of what is built today

- Rate limiting is in memory, correct for one instance only.
- Repositories (leads, users, sessions, tokens) are tested with in-memory fakes. A MongoDB integration test exists (`mongo.integration.test.ts`, runs when `MONGODB_TEST_URI` is set, wired into CI) but has **not** been run in the authoring environment (no database or Docker available).
- Sprint 1 auth is built (ADR-0004): argon2id via Node crypto, hashed session ids with rotation and reuse detection, lockout backoff, one-time email tokens, guardian consent, audit events, own-data export and delete. Email goes through `EMAIL_PROVIDER` (`log`, `brevo` or `resend`; see docs/06); the HTTP adapters are unit-tested but have not been run against the live services. New passwords are checked against the Have I Been Pwned range API (fails open).
- Admin TOTP and the purge job for soft-deleted accounts are not built.
- Lead notification to admins (email) is not built. Leads are stored and wait for the admin console (Sprint 5), so until then someone must query the database.
- The six website forms post to `/api/v1/leads` through `frontend/src/lib/leads.ts`. Account screens (register, sign in, verify, guardian consent, forgot and reset password, account page) exist; they have unit and routing tests but no browser end-to-end test yet.
