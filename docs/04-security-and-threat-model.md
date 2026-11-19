# 04 — Security and Threat Model

> Status: **Draft v0.1** · 2026-11-13. Reference standards: OWASP ASVS and OWASP Top 10, STRIDE for the threat
> walk-through. This is a design and a status ledger, not a certification. Nothing here replaces a penetration
> test before real users are onboarded.

## 1. Assets worth protecting

| Asset                                           | Why it matters                                                |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Learner, applicant and guardian personal data   | Legal duty (Law 058/2021), children's data, reputational harm |
| Admin accounts                                  | Full access to all data and content                           |
| Source code, CI, deployment secrets             | Supply-chain and takeover risk                                |
| The brand's YouTube, domain and social accounts | Loss means loss of the whole business                         |
| Availability of the site and API                | Credibility of a new brand                                    |
| Integrity of referral counts and certificates   | The growth loop and credentials lose meaning if gamed         |

## 2. Trust boundaries and attackers

Boundaries: browser ↔ edge ↔ API ↔ database; CI ↔ GitHub ↔ deployment; staff ↔ admin console; third parties
(YouTube, email, payment, npm).

Attackers considered: anonymous internet bots and scanners; a malicious or curious learner; a malicious
referral farmer; a compromised or careless intern or contractor; a phished founder; a compromised npm package
or GitHub Action; a stolen laptop; and a hosting or provider outage.

## 3. Threat walk-through (STRIDE, condensed)

| #   | Threat                                      | Control                                                                                                           | Status                                                                                                                                                  |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Credential stuffing, brute force            | argon2id, throttling, generic errors, breached-password check, admin TOTP                                         | argon2id, lockout backoff, per-IP limit, generic errors **built, tested**; breached-password check **built** (HIBP range API, fails open); TOTP pending |
| S2  | Session theft via XSS                       | httpOnly cookies, strict CSP, no tokens in storage, output encoding by React                                      | Designed; CSP Sprint 0/2                                                                                                                                |
| S3  | Session fixation / replay                   | Rotation on login and privilege change; reuse revokes the family                                                  | **Built, tested** (new session on login, rotation after 24 h, replay revokes family)                                                                    |
| T1  | NoSQL operator injection                    | Strict Zod schemas, `rejectUnsafeKeys`, Mongoose `sanitizeFilter`, simple query parser                            | **Built, tested**                                                                                                                                       |
| T2  | Prototype pollution                         | Forbidden keys rejected, depth and node limits                                                                    | **Built, tested**                                                                                                                                       |
| T3  | Mass assignment (setting `roles`, `status`) | Strict schemas reject unknown fields; roles never accepted from clients                                           | **Built (leads), pattern for the rest**                                                                                                                 |
| T4  | CSRF                                        | SameSite=Lax, Origin allow-list check, JSON-only, custom header on authenticated mutations                        | Origin and JSON-only **built, tested**; header **built, tested**                                                                                        |
| R1  | Admin denies an action                      | Append-only audit events with actor, request id, outcome                                                          | **Built** for auth, account and every admin action                                                                                           |
| I1  | Leaking stack traces and internals          | Generic 500, no framework header, errors never echo input                                                         | **Built, tested**                                                                                                                                       |
| I2  | PII in logs                                 | Redaction of auth headers, cookies, email, phone, tokens; log path only, never query or body                      | **Built**                                                                                                                                               |
| I3  | IDOR (reading another user's data)          | Object-level checks in services, tested with cross-user attempts                                                  | Policy function and tests **built**; repeat for every new owned resource                                                                                |
| I4  | Account enumeration                         | Identical responses and timing for existing and new emails                                                        | **Built, tested** for register, login, reset (timing equalised by hashing in both branches; not measured)                                               |
| I5  | Database exposed to the internet            | Private network only, auth enabled, TLS, no public port; compose binds to 127.0.0.1                               | Compose **built**; production Sprint 0 ops                                                                                                              |
| D1  | Request floods                              | Edge rate limiting and WAF, app limits, body size cap, request and header timeouts                                | App-level **built, tested**; edge Sprint 0 ops                                                                                                          |
| D2  | Slowloris                                   | `headersTimeout`, `requestTimeout`, `keepAliveTimeout`                                                            | **Built**                                                                                                                                               |
| D3  | Expensive queries and ReDoS                 | No user-supplied regexes, bounded pagination, validated lengths, index coverage                                   | Pattern; reviewed per module                                                                                                                            |
| E1  | Privilege escalation via admin routes       | Deny-by-default policy function, admin TOTP, short admin sessions, audit                                          | Sprint 1 and 5                                                                                                                                          |
| E2  | SSRF                                        | The API makes no server-side requests to user-supplied URLs; if added, use an allow-list and block private ranges | Rule                                                                                                                                                    |
| X1  | Referral farming                            | See ADR-0002 and LLD section 6                                                                                    | Sprint 3                                                                                                                                                |
| X2  | Malicious file upload                       | **No uploads in MVP.** If added, type sniffing, size cap, object storage, no execution, malware scan              | Rule                                                                                                                                                    |
| X3  | Spam and abuse of public forms              | Honeypot, strict validation, rate limit, consent required                                                         | **Built, tested**                                                                                                                                       |
| X4  | Clickjacking                                | `frame-ancestors 'none'`, `X-Frame-Options: DENY`                                                                 | **Built** (API); web app Sprint 0/2                                                                                                                     |

## 4. Supply chain

| Risk                              | Control                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious or hijacked npm package | Exact versions, committed lockfiles, `npm ci --ignore-scripts`, Dependabot with a 3-day cooldown, `npm audit` gate, dependency review on PRs (public repos)           |
| Compromised GitHub Action         | All Actions pinned to full commit SHAs; `permissions: contents: read` by default; `persist-credentials: false`; no `pull_request_target`; Dependabot updates the pins |
| Leaked secrets                    | `.gitignore` for env and key files; gitleaks in CI with full history; secrets only in the platform secret store                                                       |
| Poisoned base image               | Official Node image, non-root user, no build tools in the runtime image; pin by digest at first deployment                                                            |
| Typosquatting                     | New dependencies need a stated reason in the PR; prefer fewer dependencies (Node's `--env-file` replaces dotenv)                                                      |

## 5. Account and people security (the part most startups skip)

- Two-factor authentication on: GitHub, the YouTube/Google account, domain registrar, email, hosting, Cloudflare,
  and every social account. Use authenticator apps or hardware keys, not SMS.
- Both founders hold recovery access to every critical account. Store recovery codes in a password manager.
- Protect `main`: require pull requests, passing checks, and signed commits when practical; no force pushes.
- Interns and contractors work on synthetic data only, get least-privilege access, and lose it on the last day.
- Every device that touches production uses full-disk encryption and a screen lock.
- Rotate any credential that has ever been pasted into a chat, ticket or email.

## 6. Privacy and legal controls (Law 058/2021, per DLA Piper; confirm with counsel)

| Obligation                                            | Implementation                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Register with NCSA before processing                  | Launch gate (sprint plan). Not yet done                                                 |
| Store personal data in Rwanda (or have authorisation) | ADR-0003. Decision pending                                                              |
| Consent, and withdrawal                               | Consent recorded with notice version; marketing consent separate; withdrawal in profile |
| Under 16: guardian consent                            | Age bracket captured now; guardian flow Sprint 1                                        |
| Access, rectification, erasure, objection             | Self-service export and delete (Sprint 1); admin procedure documented before launch     |
| Breach notification within 48 hours                   | Incident runbook below; request ids and audit events enable detection and scoping       |
| Data minimisation and retention                       | Leads auto-delete via TTL (default 730 days, to confirm); unverified accounts expire    |
| DPO                                                   | Name one before launch                                                                  |

### Incident runbook (first version)

1. **Detect and contain** within the hour: revoke sessions (`sessions` purge), rotate secrets, block the vector.
2. **Record the time you became aware.** The 48-hour NCSA clock starts then.
3. **Scope** with audit events and logs: which data, how many people, which accounts.
4. **Notify** NCSA within 48 hours, then affected people in writing if the risk is high.
5. **Fix, review, write it up** within one week, and add a test that would have caught it.

## 7. Security verification plan

| When          | What                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Every PR      | Typecheck, lint, tests, audit, gitleaks, CodeQL (when available), dependency review (public repos)                                        |
| Each sprint   | Re-run the mutation check: remove each security middleware, confirm a test fails                                                          |
| Sprint 1 end  | Integration tests for auth, IDOR tests for every owned resource                                                                           |
| Before launch | OWASP ASVS Level 1 checklist walk-through, external penetration test or at least a structured review, backup restore test, incident drill |
| Quarterly     | Dependency and access review, restore test, rotate keys                                                                                   |

## 8. Verified so far (this repository, 2026-11-13)

- 79 backend tests pass on Node 24 and Node 26, from a clean `npm ci --ignore-scripts`.
- Mutation check: removing `rejectUnsafeKeys`, `originGuard`, `requireJson`, or the honeypot each made tests fail.
- `npm audit --omit=dev`: 0 vulnerabilities.
- The compiled server was started as a real process: production with an `http://` origin refuses to boot,
  security headers are present, injection and form-post and bad-origin requests were rejected, and SIGTERM
  shuts it down cleanly.
- Sprint 1 (branch `feat/sprint-1-accounts-consent`): 130 backend tests pass on Node 26 with the new auth code. Mutation
  check: removing the CSRF header check, session-reuse revocation, lockout, reset session revocation, the
  authorisation policy, or the inactive-account check each made a test fail.
- Not verified: the email adapters and the HIBP call against the live services; behaviour against a real MongoDB, the Docker image build (no Docker daemon here; stages were
  simulated locally), CodeQL and dependency review (need a public repo or Advanced Security), and every GitHub Actions
  workflow run (they have not run on GitHub yet).

### Sprint 2 additions

- Lesson content (including video ids) is released only after an access check (unlocked enrolment or explicit free preview); catalogue responses are an explicit allow-list with no video ids or transcripts. Tested.
- Progress writes are scoped to the session user; cross-user writes are refused. Tested.
- Mongoose `sanitizeFilter` rewrote our own `$gt/$ne/$exists` operators, which would have broken token consumption and session revocation on a real database. Fixed with `trusted()` and a regression test.
- Web app sends CSP (report-only), `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`.

## 9. Known gaps and accepted risks

1. In-memory rate limiting is per instance; many users behind one carrier IP can share a limit.
2. The YouTube gate is not content protection (ADR-0005).
3. No admin or user authentication yet; the only write endpoint is the public lead form.
4. Production hosting, TLS, backups, and edge protection are decisions, not yet implementations.
5. Frontend CSP and security headers are designed but not applied.

## Internship programme threats (Sprint 4)

New attack surface: an application form that takes free text and links from the public, staff screens that show
that text, applicant records about young people, and a supervisor role outside the staff console.

| Threat | What could go wrong | Control in the code | Evidence |
| --- | --- | --- | --- |
| Reading another applicant's data (IDOR) | Guessing application ids to read, withdraw or accept for someone else | Every applicant route filters by the signed-in user; mismatch is a 404, not a 403 | `internships.test.ts`: "returns 404 for someone else's application" |
| Reviewer notes leaking | Private opinions or scores shown to the applicant, exported, emailed, or logged | Allow-list DTOs per audience; fixed-text emails; audit stores ids, never text | "never shows reviewer notes, scores or staff ids", "emails the applicant fixed text only", audit test |
| Duplicate or racing actions | Double submit, two reviewers moving one application, placing one person twice, overfilling a posting | Unique indexes, compare-and-set status changes, claim-then-create placement, capacity checks | "is idempotent", "cannot place the same application twice", Mongo integration tests |
| Skipping the process | Offering without review, placing without acceptance or a supervisor | Transition table by actor; `checkPlacement` | exhaustive state-machine test |
| Child safety | An under-18 placed without a guardian; an under-16 applying | Minimum age per posting, guardian required and staff-verified before placement | eligibility and placement tests |
| Malicious links and scripts in applications | `javascript:` or data URLs, credentials in URLs; stored script text rendered to staff | https-only links without credentials (client and server); React escapes text; links open with `noopener noreferrer nofollow` | `cleanLink` tests, strict zod schemas |
| Mass assignment | Sending `status`, `userId` or `notes` in the apply body | Strict schemas reject unknown fields | "rejects unknown fields" |
| Privilege confusion | Supervisor reaching staff data; intern writing feedback; support placing interns | Separate permissions; supervisor API checks ownership; staff routes need the second factor | "supervisor access", "applies each permission" |
| Spam and abuse of the form | Mass applications, emails sent to victims | Per-IP apply limiter, one application per posting, verified accounts only, fixed-text email to the account's own address | rate limiter config, eligibility tests |
| Spreadsheet formula injection | An applicant named `=HYPERLINK(...)` executing when staff open the CSV | Shared CSV writer neutralises leading formula characters; export is permissioned and audited | "exports applications as CSV" |
| Data kept too long | Applicant data lives after the person asks for deletion | Account purge removes applications and placements; export includes the applicant's own view | purge rules (doc 07 section 7.1) |

Known gaps (tracked in doc 10): supervisors have no second factor; the intern agreement text awaits legal review;
Mongo repository tests run only where a test database is configured.

## Social sign-in threats

| Threat | What could go wrong | Control in the code | Evidence |
| --- | --- | --- | --- |
| Login CSRF / authorization-code injection | An attacker makes a victim's browser finish the attacker's sign-in | Sealed state cookie bound to the browser, compared in constant time, 10-minute expiry, single use | `oauth.test.ts` "protection against forged and replayed callbacks" |
| Account takeover by matching email | A look-alike provider account with the victim's email gets merged in | Never merge by email; link only by the signed-in person via POST | "account takeover by matching email" |
| Linking CSRF | A website makes a victim attach the attacker's provider account | Link starts with an authenticated POST and the same session must finish it | "refuses to finish a link in a different session" |
| Unverified provider emails ("nOAuth") | Microsoft or Facebook email claims are attacker-controlled | Never treated as verified; mailbox code required before the account exists | "providers that do not vouch for the email" |
| Forged or replayed id_token | Fake token accepted | Signature checked against provider keys; audience, expiry, nonce, issuer (and tenant id for Microsoft) | `providers.test.ts` (unsigned, wrong key, wrong nonce, wrong tenant) |
| Open redirect after sign-in | `next=https://evil` | Only same-site paths survive; everything else becomes `/account` | "only follows a same-site next page" |
| Provider text injection | Script or markup in names and errors | Names cleaned and length-capped; only fixed error codes reach the page; no provider text logged | `cleanName` tests, callback tests |
| Secret exposure | Client secret in URLs, logs or the browser | Secret only in server-to-server POST bodies; never in the authorize URL; nothing sensitive in logs | `providers.test.ts`, live log check |
| Locked-out users | Removing the only sign-in method | The last method cannot be removed; passwordless delete needs the typed email | "disconnects a provider, but never the last way to sign in" |
| Child safety bypass | Under-16 skipping the guardian step via a provider | Age group and guardian are required on the finish step; account inactive until guardian consents | "learners under 16" |
| Brute-forcing the mailbox code | Guessing the 8-digit code | Code bound to the sealed sign-up and mailbox, 15-minute life, rate limited | mailbox-code tests |
| Dependency risk | A new library | One zero-dependency library (`jose`), pinned to an exact version older than 14 days | `package.json` |

Known gaps: the staff console second factor still applies after a social sign-in; there is no per-account lock for repeated
wrong mailbox codes (the rate limiter and 15-minute life bound it).
