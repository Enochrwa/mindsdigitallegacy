# 10 — Sprint backlog (story level)

> Status: **v0.1** · 2026-11-16. Companion to [`05-sprint-plan.md`](05-sprint-plan.md). Estimates are in
> **team-hours** (design, code, tests, docs, review). They are guesses from the size of the earlier sprints and
> should be corrected after Sprint 4. A story is done only when it meets the Definition of Done in doc 05.

Legend: **Own** = suggested owner (A = backend-leaning founder, B = frontend/content-leaning founder; swap freely).
**P** = priority (M must, S should, C could). Stories marked *stretch* are the first to slip.

## Findings from the 2026-11-16 repository review

These came from reading `main` and running the toolchain, and they drive the stories below.

| ID   | Finding                                                                                                          | Evidence                                              | Story |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----- |
| R-1  | CSP is report-only and has no report endpoint, so violations are visible only in each visitor's console           | `frontend/src/lib/security-headers.ts`; no report-uri  | C4    |
| R-2  | Rate limiter uses an in-memory store; limits are per instance and trivially bypassed with two instances           | `backend/src/core/http/rateLimit.ts`                  | H5    |
| R-3  | Internship module is a README only; the public page has no backend                                                | `backend/src/modules/internships/`                    | I1-I9 |
| R-4  | Frontend has both `bun.lock` and `package-lock.json`; CI and Dependabot use bun                                   | `frontend/`                                           | C8    |
| R-5  | 131 formatting errors excluded from CI lint instead of fixed                                                      | `.github/workflows/frontend-ci.yml`                   | C8    |
| R-6  | No end-to-end browser tests, no axe or performance gate in CI                                                     | `.github/workflows/`                                  | C5-C7 |
| R-7  | No deployment workflow, no staging environment, no image build or scan in CI                                      | `.github/workflows/`, `backend/Dockerfile` comment    | H4, P1 |
| R-8  | CODEOWNERS lists one person; no second reviewer is possible yet                                                    | `.github/CODEOWNERS`                                  | H1    |
| R-9  | CodeQL and dependency review only run if the repo is public or has Advanced Security                              | `codeql.yml`, `dependency-review.yml` conditions      | H1    |
| R-10 | The frontend is built as a Cloudflare Worker (SSR). Requests carrying session cookies and form data pass through it | `vite.config.ts` preset `cloudflare-module`           | F4, H6 |
| R-11 | Spring 2026 supply-chain incidents hit CI pipelines and a router library this project depends on (TanStack)       | Public post-mortems (see sources); verify our versions | H2, H3 |
| R-12 | A personal access token was pasted into chat to enable this work                                                  | n/a                                                   | H1    |
| R-13 | Backend `package.json` and an open Dependabot branch disagree on TypeScript (6.0.3 vs 7.0.2)                        | `origin/dependabot/npm_and_yarn/backend/typescript-7.0.2` | H3 |

R-12 action: revoke that token now, create a new fine-grained one with the minimum scope and a short expiry, and
never paste credentials into chats, issues or commits. CI uses `GITHUB_TOKEN`, so no long-lived token is needed there.

---

## Sprint 4 — Internship pipeline (16 Nov to 27 Nov) · committed 28 h

**Goal:** supervised internships run end to end on the platform, with the supervisor rule enforced in code.
**Proposal anchor:** section 4.3 (applying does not guarantee placement; no placement without a supervisor; no
promises of employment).

| ID  | Story                                                                                                                                  | P | Own | h |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | - | --- | - |
| I1  | Data model and ADR-0008: `internship_postings`, `internship_applications`, `placements`, `status_events`; state machine written down   | M | A   | 3 |
| I2  | Posting admin API: department, requirements, duration, slots, required supervisor capacity, publish rules, close date                    | M | A   | 4 |
| I3  | Applications API: apply (idempotency key), my applications, withdraw; consent; under-18 flow needs guardian or institution approval field | M | A   | 5 |
| I4  | Review pipeline: submitted, shortlisted, interview, offered, accepted, placed, rejected, withdrawn; reviewer notes admin-only; audited     | M | A   | 4 |
| I5  | Placement rules: cannot place without a named supervisor and open slot; agreement record (version, date, accepted by)                     | M | A   | 3 |
| I7  | Frontend: live postings on `/internships`, apply form, applicant dashboard with status and the "no guarantee" notice                      | M | B   | 4 |
| I8  | Admin module: postings, applicants, review board, supervisor assignment (registry-driven console)                                         | M | B   | 3 |
| I9  | Tests: IDOR (applicant sees only own), state-transition table, idempotent re-submit, guardian rule, notes never leak to applicants        | M | A+B | 2 |
| I6  | *Stretch:* status emails via the existing mailer (submitted, shortlisted, decision)                                                      | S | A   | 2 |

**Acceptance highlights**

- Submitting the same application twice with one idempotency key creates one record and returns the same response.
- An applicant cannot read, withdraw or list another applicant's data (tested).
- A placement request without a supervisor, or beyond slot capacity, is rejected with a clear admin error.
- Reviewer notes and scores are never present in any applicant-facing response (contract test).
- Every transition writes an audit event with actor, from-state, to-state.
- Public postings show only open, published roles; nothing implies guaranteed placement or employment.

**Dependencies:** founder decision F6 (paid, stipend, unpaid) changes the agreement text, not the code shape.
**Risks:** scope creep into interview scheduling (cut-listed); child-safety rules need the lawyer review (F5).

---

## Sprint 5b — Close-out and quality gates (30 Nov to 11 Dec) · committed 28 h

**Goal:** finish what Sprints 1, 2, 3 and 5 promised and gate it in CI so it stays finished.

| ID  | Story                                                                                                                                                             | P | Own | h |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | - | --- | - |
| C1  | Live email: pick provider (doc 06), set SPF, DKIM, DMARC on the sender domain, send real verify and reset mails to Gmail, Outlook and one Rwandan mailbox; record results | M | A   | 3 |
| C2  | **Done (needs real-DB run).** Purge job for deleted accounts (scheduled, idempotent, audited) with retention rules from doc 07                                                                   | M | A   | 3 |
| C3  | **Partly done.** Purge integration tests written; CI job now runs every `*.integration.test.ts`. Confirm the Mongo integration CI job is green; extend integration tests to courses, referrals, sessions and access repositories                                    | M | A   | 3 |
| C4  | **Partly done.** Report endpoint and enforce switch built; enforcing and nonces remain. CSP: add `POST /api/v1/csp-report` (rate-limited, size-capped, no personal data stored), review a week of reports, switch to enforce, plan nonces to remove `unsafe-inline` | M | A+B | 5 |
| C5  | **Scaffolded, unrun.** Playwright E2E: register, verify, sign in, enrol, play lesson, referral unlock; guardian flow; admin MFA setup and sign-in; run in CI against the in-memory dev server | M | B   | 5 |
| C6  | **Scaffolded, unrun** (inside the E2E suite). axe accessibility checks in CI on the main routes (home, courses, lesson, auth, account, internships)                                                              | S | B   | 2 |
| C7  | **Bundle budget done**; Lighthouse remains. Performance budget in CI: bundle-size limit now, Lighthouse CI on a throttled mobile profile once staging exists                                                   | S | B   | 3 |
| C8  | **Done.** One format-only commit; remove the Prettier exclusion from frontend CI; keep one lockfile (bun, to match CI) and delete the other; fix the 7 lint warnings           | M | B   | 2 |
| C9  | Real video IDs for the first course; verify unlisted embeds play on the staging domain; update ADR-0005 open question                                              | M | B   | 2 |

**Acceptance highlights**

- A verification mail sent from production configuration reaches the inbox (not spam) in all three mailboxes tested.
- Deleted accounts are purged on schedule; a test proves related records and tokens are removed and audit stubs remain.
- CSP report endpoint accepts only the report content types, rejects oversized bodies, and stores no IPs or user identifiers.
- E2E and axe jobs are required checks on `main`; CI fails on a new serious accessibility violation.
- Frontend CI runs lint with Prettier enforced and one lockfile.

**Dependencies:** F7 (domain and sender domain) for C1; F9 (real videos) for C9; staging environment from P1 can be a
simple preview deployment first.
**Cut order if over:** C7 (budget only), then C6.

---

## Sprint 6 — Security hardening (14 Dec to 8 Jan, three weeks) · committed 31 h

**Goal:** a hostile reviewer cannot find a high-severity issue, and we can restore and respond.
Proactive posture: assume a dependency, a workflow or a laptop can be compromised, and limit the damage.

| ID  | Story                                                                                                                                                                  | P | Own | h |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | - | --- | - |
| H1  | GitHub controls: rulesets on `main` (PR required, required checks, no force push, signed commits), add co-founder to CODEOWNERS, secret scanning with push protection, private vulnerability reporting, decide public vs private repo so CodeQL and dependency review actually run; **revoke the shared token (R-12)** | M | A | 2 |
| H2  | Workflow hardening: add a workflow linter (zizmor), confirm no `pull_request_target` or untrusted-code-in-trusted-context pattern, minimum `permissions` per job, no cache sharing between untrusted and release workflows, keep actions pinned by SHA with Dependabot, evaluate npm `min-release-age` alongside the existing Dependabot cooldown | M | A | 3 |
| H3  | Dependency review: check the frontend lockfile against the published TanStack incident advisories (we have not verified which versions were affected), remove unused UI packages and components, decide on the TypeScript 7 bump, keep `--ignore-scripts`, generate a CycloneDX SBOM | M | A | 3 |
| H4  | Container: build the image in CI, pin base image by digest, scan with Trivy or Grype (fail on high), non-root and read-only filesystem in compose, attach provenance and SBOM | M | A | 4 |
| H5  | Shared rate-limit store (Mongo or Redis) so limits hold across instances; per-account login and reset throttles; abuse tests                                              | M | A | 3 |
| H6  | OWASP ASVS Level 2 walkthrough with evidence per control (auth, sessions, access control, input handling, logging, config); fix gaps; re-read doc 04 threat table and update statuses; include the Worker SSR path from R-10 | M | A+B | 5 |
| H8  | Observability: structured logs without personal data, error tracking, uptime and health alerts, audit alerts (bursts of failed admin MFA, role changes, exports)           | M | A | 3 |
| H9  | Backups and drills: encrypted backups stored in Rwanda, restore drill with timings recorded, runbooks for incident response (48-hour NCSA clock), key rotation (`TOTP_ENCRYPTION_KEY`, session secrets), account-takeover and leaked-secret playbooks | M | A | 4 |
| H11 | Book an external penetration test or structured review (founder task, 2 h of own time); triage and fix findings; re-test                                                | M | A+B | 2 |
| H7  | *Stretch:* OWASP ZAP baseline scan against staging, nightly, with triage                                                                                                | S | A | 3 |
| H10 | *Stretch:* k6 load test of registration, lesson and referral endpoints with pass thresholds                                                                            | S | A | 2 |

**Acceptance highlights**

- A fresh clone cannot push to `main`; every merge needs passing required checks and a review.
- Image scan and workflow lint are required checks; the SBOM is published with each release.
- A recorded restore from backup into a clean environment succeeds and the time taken is written in the runbook.
- Two API instances behind a proxy still enforce one shared login-throttle budget.
- The ASVS checklist is committed with a pass, fail or not-applicable and evidence for every item.
- No open Critical or High findings at the end of the sprint; Medium findings have owners and dates.

**Holiday note:** capacity is reduced over 24 December to 2 January; the three-week length already assumes this.

---

## Sprint 7 — Pilot cohort and launch readiness (11 Jan to 22 Jan) · committed 28 h

**Goal:** a small real cohort uses the product under the launch gate; decide the referral threshold from data.

| ID  | Story                                                                                                                                              | P | Own | h |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | - | --- | - |
| P1  | Deployment pipeline: staging and production environments, manual approval for production, short-lived credentials (OIDC) where the host supports it, rollback runbook | M | A | 5 |
| P2  | Pilot cohort of 20 to 30 invited learners; cohort capacity setting; in-product feedback form; daily review of the referral review queue          | M | B   | 3 |
| P3  | Funnel dashboard and A/B readout for referral threshold 3 versus 5 (data already collected per variant)                                           | M | A   | 3 |
| P4  | Insert lawyer-approved legal text (privacy, terms, guardian consent, intern terms); cookie and consent copy                                       | M | B   | 2 |
| P5  | Support process: inbox, response targets, macros, public status page                                                                              | S | B   | 2 |
| P7  | Share assets: Open Graph cards per course, ready-made share messages for WhatsApp, LinkedIn, X, Facebook, and Instagram instructions (see growth rules below) | M | B | 4 |
| P8  | Bug bash and fixes from the pilot                                                                                                                 | M | A+B | 5 |
| P9  | Go or no-go review against the launch gate                                                                                                        | M | A+B | 1 |
| P6  | *Stretch:* Kinyarwanda for the core pages (home, courses, register, privacy)                                                                       | C | B   | 6 |

**Public launch** follows one clean pilot week (no Sev-1 or Sev-2 incidents, funnel and email delivery healthy).

---

## Growth and content rules for the free, share-to-unlock model

The referral loop is the growth engine, so its rules protect the brand as much as the code does.

- Learners share a **link**; we never read contacts and never send messages on their behalf.
- Share text is pre-written, honest and editable; no fake urgency, no pressure copy.
- "Invite 5 or 10" is a configurable threshold (already a setting). Start with the lower number for the pilot; the
  A/B readout in P3 decides.
- Alternative unlock paths stay available (ambassador or partner codes) so learners without a large network are not shut out.
- Referral rewards never depend on a friend's payment; verified sign-ups only (ADR-0002).
- Content cadence plan (founder B): three launch courses (Digital foundations, Office and productivity, Web
  development basics), 8 to 12 short videos each, published as unlisted YouTube videos and embedded through the facade.
  Record a batch of 4 per week before Sprint 7 so the pilot never runs out of lessons.
- Instructors and guest trainers need a written agreement before their material is published (proposal section 8).

## Metrics we watch from the pilot

| Metric                                  | Source                  | Healthy sign                              |
| --------------------------------------- | ----------------------- | ----------------------------------------- |
| Registration to verified email rate     | Referral funnel         | Above 70% (to calibrate)                  |
| Verified signups per referrer           | Referral events         | Median at or above the threshold          |
| Unlock to first lesson started          | Progress API            | Above 60% (to calibrate)                  |
| Lesson completion for course 1          | Progress API            | Above 35% (to calibrate)                  |
| Rejected or held referrals              | Review queue            | Below 10% of events                        |
| Email delivery and spam placement       | Provider logs           | Inbox in all test mailboxes                |
| P95 API latency, error rate             | Logs and alerts         | Within budget set in H8                    |

Targets marked "to calibrate" are placeholders; set them after the first cohort rather than trusting these numbers.

## Sources used for this plan

- DLA Piper, Rwanda data protection (storage in Rwanda, transfer rules): https://www.dlapiperdataprotection.com/?c=RW&t=law
- Hogan Lovells, key features of the Rwandan data protection law (registration within 30 days): https://hoganlovells.com/en/publications/key-features-of-the-new-rwandan-data-protection-law
- PwC Rwanda, data protection beyond registration (June 2026): https://www.pwc.com/rw/en/assets/pdf/data-protection-in-rwand.pdf
- Kolonell, registering a business with the RDB (2026): https://kolonell.com/en/blog/register-business-one-stop-shop-rwanda-rdb-2026
- AfriCarrieres, starting a business in Rwanda (fees quoted differ from other sources; verify on the RDB portal): https://africarrieres.com/rwanda/en/guide/employeur-entreprise/starting-business
- New Times, RDB online registration upgrade (January 2026): https://www.newtimes.co.rw/article/32325/news/technology/business-registration-to-go-fully-online-rdb
- GitHub Actions 2026 security roadmap summary: https://blog.stephane-robert.info/en/post/github-actions-2026-security-roadmap/
- Hardening GitHub Actions against 2026 supply-chain attacks: https://rodtrent.substack.com/p/hardening-github-actions-and-cicd
- Security hardening GitHub workflows at scale (TanStack/router incident, May 2026): https://medium.com/@jordanritter/security-hardening-github-workflows-at-scale-d291a33774e1
- Transloadit, response to the Mini Shai-Hulud npm campaign (May 2026): https://transloadit.com/blog/2026/05/mini-shai-hulud-supply-chain-response/

Secondary sources (law-firm blogs, vendor posts) are indicative. Confirm legal and fee details with the RDB, the
NCSA data protection office and a Rwandan lawyer before relying on them.

## Sprint 5b progress log

Updated 2026-11-16 on branch `feat/sprint-5b-closeout`.

| Story | State | Evidence | Still needed |
| --- | --- | --- | --- |
| C1 Live email | Not started | n/a | Founder: provider, domain, SPF/DKIM/DMARC |
| C2 Purge job | Built, unit-tested (6) | `modules/retention` | Run the 4 integration tests against MongoDB in CI |
| C3 Mongo integration | Partly | CI job runs all integration files | Courses, referrals, sessions repository tests |
| C4 CSP | Partly | Endpoint, 13 tests; live check logged a sanitised report | A week of reports, enforce, nonces |
| C5 E2E | Scaffolded | Types and lint pass; helpers match backend TOTP | First CI run in a real browser |
| C6 axe | Scaffolded | In `e2e/public.spec.ts` | First CI run; fix whatever it finds |
| C7 Budget | Done | `bun run budget`; fails when limit tightened | Lighthouse after staging exists |
| C8 Lint and lockfile | Done | Lint zero warnings; frozen bun install works | n/a |
| C9 Real videos | Not started | n/a | Founder: record videos |

## Sprint 4 progress log

Updated 2026-11-17 on branch `feat/sprint-4-internships`.

| Story | State | Notes |
| --- | --- | --- |
| I1 Data model and rules | Done | Types, pure rules, three collections, state machine in `internships.rules.ts` |
| I2 Posting admin API | Done | CRUD, publish (capacity rule), close, slugs, dates |
| I3 Applications API | Done | Idempotent apply, withdraw, guardian rule, https-only links, strict validation |
| I4 Review pipeline | Done | Compare-and-set transitions, notes with scores, message to applicant, audit |
| I5 Placement rules | Done | Supervisor-on-posting, capacity, slots, guardian verification, agreement, dates |
| I6 Status emails | Done (was stretch) | Fixed-text mails: received, shortlisted, interview, offered, rejected, placed |
| I7 Frontend (public and applicant) | Done | Live postings, posting page, apply form, My internships with accept and withdraw |
| I8 Admin console | Done | Postings, applications review dialog, placements, supervisor capacity, CSV export |
| I9 Tests | Done | Backend 51 new tests; frontend 12; live smoke test of 31 steps against the real servers |

Beyond the plan (added because the programme needs it):

- Supervisor role with its own view and feedback (private or shared with the intern), average ratings
- Guardian verification step for under-18 applicants, and a minimum age per posting
- Capacity guard: a posting cannot publish with more places than its supervisors can guide
- Applicant-visible timeline and a "message from our team" that staff choose to share
- Placement lifecycle: end (completed, ended early, cancelled), supervisor reassignment, intern role added and removed
- Internship data in the person's own export and in the account purge
- CSV export (permissioned and audited, formula-injection safe)
- Stats: offer rate, active interns, per-supervisor load

Still open for Sprint 4 (not code):

- Lawyer-approved agreement text (F5, F6): the in-app text is a labelled draft
- Pay terms decision (F6): the posting form supports unpaid, stipend and paid
- Run `internships.integration.test.ts` and the purge integration tests against MongoDB in CI
- MFA for supervisors (they handle intern contact details)

## Social sign-in log

Updated 2026-11-18 on branch `feat/social-sign-in`.

| Item | State | Evidence |
| --- | --- | --- |
| Providers: Google, Microsoft, GitHub, Facebook, LinkedIn | Built | Adapters with 21 tests using real signed tokens and a fake network |
| Safe flow (state, PKCE, nonce, no email merge, mailbox code, guardian rule) | Built | 34 flow tests including forged, replayed and takeover attempts |
| Linking and disconnecting in My account; passwordless accounts can delete with the typed email | Built | Flow tests; frontend tests |
| Finish-signing-up page; buttons on Sign in and Sign up | Built | Typecheck, lint, build; live 15-step run against the real servers |
| Setup guide with console steps for every provider | Written | `docs/11-social-sign-in-setup.md` |
| Real provider keys | **Not done (needs you)** | Follow doc 11; nothing was tested against real Google, Microsoft, GitHub, Facebook or LinkedIn |
| Browser E2E for the social screens | Written, unrun | `frontend/e2e/social.spec.ts` (uses the demo providers) |
| Privacy notice update naming the providers | Open | Lawyer review (sprint plan F5) |
