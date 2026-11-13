# MDL API

Node.js (26 LTS, supports 24+), Express 5, TypeScript (strict), Zod, Mongoose 9, MongoDB.
Design: `../docs/02-hld.md`, `../docs/03-lld.md`. Threat model: `../docs/04-security-and-threat-model.md`.

## Quick start

```bash
cd backend
nvm use                  # Node 26 (.nvmrc); 24+ works
cp .env.example .env     # then edit; never commit .env
npm ci
docker compose up -d mongo   # local MongoDB, bound to 127.0.0.1 (set MONGO_PASSWORD first)
npm run dev              # http://127.0.0.1:4000/api/v1/health
```

Without `MONGODB_URI` the API still starts and `/api/v1/ready` returns 503.

## Scripts

| Script               | What it does                                                 |
| -------------------- | ------------------------------------------------------------ |
| `npm run dev`        | Watch mode with `.env` loaded                                |
| `npm run check`      | Typecheck, lint, format check, tests (what CI runs)          |
| `npm test`           | Vitest + Supertest, no database needed                       |
| `npm run build`      | Compile to `dist/` (tests and fixtures excluded)             |
| `npm run audit:prod` | Fails on high-severity advisories in production dependencies |

## API (v1)

| Method | Path             | Auth | Purpose                                                   |
| ------ | ---------------- | ---- | --------------------------------------------------------- |
| GET    | `/api/v1/health` | none | Liveness. Not rate limited                                |
| GET    | `/api/v1/ready`  | none | Readiness (database connected). Not rate limited          |
| POST   | `/api/v1/leads`  | none | Contact, service, partner, course and internship interest |

Errors always look like `{ "error": { "code", "message", "requestId", "details?" } }`.
`details` is present only for validation errors and never contains submitted values.

### `POST /api/v1/leads`

JSON only. Required for every kind: `kind`, `fullName`, `email`, `consent: true`,
`privacyNoticeVersion`. Optional fields must be **omitted** when empty, not sent as `""`.
`website` is a honeypot: leave it out of the visible form (hidden from users, and ignored by assistive
technology), because any value makes the submission be silently discarded.

| `kind`                                   | Extra fields                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `contact`                                | `message` (10–2000 chars)                                                         |
| `service_request`                        | `service`, `message`, optional `budget`, `organization`                           |
| `partner_inquiry`                        | `partnerType`, `message`                                                          |
| `course_interest`, `internship_interest` | `interest`, `ageBracket` (`under_16` or `16_plus`), `guardianContact` if under 16 |

Response: `201 { "status": "received" }`, identical for stored and discarded submissions.

## Layout

```
src/
  server.ts              process bootstrap, timeouts, graceful shutdown
  app.ts                 createApp(deps): middleware order is part of the security design
  config/env.ts          validated environment (fails fast, never prints values)
  core/                  errors, logger, http middleware (security, rate limit, validation guards)
  db/connect.ts          Mongo connection (URI from config only)
  modules/<name>/        one folder per bounded context: schema, model, repository, service, routes
  testing/fixtures.ts    test helpers (excluded from the build)
```

Rules for new modules: validate with a strict Zod schema, keep persistence behind a repository
interface, take dependencies as arguments (no globals), return generic errors, and add tests that fail
when the protection is removed.

## Security notes for contributors

- Do not add `express-mongo-sanitize` or `hpp`: they mutate `req.query`, which is read-only in Express 5.
  Use strict Zod schemas plus `rejectUnsafeKeys`.
- Never log request bodies, headers, or query strings. Log method and path only.
- Never put secrets in the repo, in `.env.example`, or in CI logs.
- Interns and contractors get **synthetic data only**, never production data or credentials.
