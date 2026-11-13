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
| R1  | Admin denies an action                      | Append-only audit events with actor, request id, outcome                                                          | **Built** for auth and account events; admin actions Sprint 5                                                                                           |
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

## 9. Known gaps and accepted risks

1. In-memory rate limiting is per instance; many users behind one carrier IP can share a limit.
2. The YouTube gate is not content protection (ADR-0005).
3. No admin or user authentication yet; the only write endpoint is the public lead form.
4. Production hosting, TLS, backups, and edge protection are decisions, not yet implementations.
5. Frontend CSP and security headers are designed but not applied.
