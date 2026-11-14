# 05 — Sprint Plan

> Status: **Draft v0.1** · 2026-11-13. Two founders, part-time. Sprints are **two weeks**, planned for about
> 20 focused hours per person per sprint, which is an assumption to adjust after Sprint 1.
> Order follows risk: legal and security foundations first, growth loop second, polish last.

## Principles

1. Ship a thin vertical slice every sprint that a real person can use.
2. Nothing that collects real personal data goes live before the **launch gate** below.
3. Every story has acceptance criteria and a test. Security stories are not optional extras.
4. Offer only what MDL can deliver (proposal stage 1). The site shows "open now" and "coming soon" honestly.
5. Cut scope, never quality or security. The cut list at the bottom says what goes first.

## Launch gate (blocks real registrations; does not block building)

- [ ] Company registered with RDB (name search done, brand and domain secured)
- [ ] NCSA registration submitted; data protection officer named
- [ ] ADR-0003 Accepted: database location decided and lawful
- [ ] Privacy notice and terms reviewed by a Rwandan lawyer; guardian-consent wording approved
- [ ] Internship Guidelines (2020) read in full; intern terms drafted (stipend or unpaid decided)
- [ ] 2FA on every critical account; recovery access shared between both founders
- [ ] Backups configured and one restore tested; uptime alerting on
- [ ] Penetration test or structured security review done, findings fixed

## Sprint 0 — Foundations (done in this repository, plus founder tasks)

**Goal:** a safe base that both of you can build on.

| Item                                                                                                                         | State                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Research, gap analysis, HLD, LLD, threat model, ADRs                                                                         | Done (this commit)                            |
| Backend foundation: config, logging, security headers, CORS, rate limits, error model, health                                | Done, tested                                  |
| Leads API with consent, age rule, honeypot, retention TTL                                                                    | Done, tested                                  |
| Repo split into `frontend/`, `backend/`, common root; per-part CI workflows and Dependabot (ADR-0007)                        | Done                                          |
| CI: backend (Node 24 and 26, plus MongoDB integration job), frontend, audit, CodeQL, gitleaks, dependency review             | Written; GitHub run results not yet confirmed |
| Dependabot, CODEOWNERS, PR template, SECURITY.md                                                                             | Done                                          |
| **Founders:** enable branch protection on `main`, 2FA everywhere, enable private vulnerability reporting and secret scanning | To do                                         |
| **Founders:** answer the open decisions in `01-research-and-gap-analysis.md` section 11                                      | To do                                         |
| **Founders:** RDB name search, domain, social handles, YouTube channel                                                       | To do                                         |

## Sprint 1 — Accounts, consent, and the first live form

> Status: backend auth, sessions, consent, guardian flow, audit, export and delete are built (merged). Added on
> `feat/account-screens-and-providers`: account screens (register, sign in, verify email, guardian consent,
> forgot and reset password, resend verification, account page with consent, export and delete), a Brevo and
> Resend email adapter, a resend-verification endpoint, and the Have I Been Pwned breached-password check.
> **Still open:** choosing and configuring the email provider and sender domain (SPF, DKIM, DMARC) and sending a
> real test mail (the adapters are unit-tested but untested against the live providers); running the MongoDB
> integration test in CI; admin TOTP (Sprint 5, needs the admin console); the purge job for deleted accounts;
> a browser-level test of the new screens (Sprint 5 Playwright).

- Auth: registration, email verification, login, logout, password reset, session rotation (ADR-0004)
- Users, roles, consent records, age bracket, guardian-consent flow for under 16
- Audit events service
- Integration test harness with a real MongoDB in CI; unique-index, TTL-index and IDOR tests
- Frontend: typed API client; wire `LeadForm` (consent, honeypot, error states); privacy notice page
- Email provider chosen; verification and reset emails; SPF, DKIM, DMARC set on the sending domain
- Self-service export and delete (basic)

**Acceptance highlights:** same response and timing for existing and new emails; a learner cannot read another
learner's record (tested); guardian-less under-16 accounts stay inactive; all four existing site forms submit.

## Sprint 2 — Academy MVP

**Status: built on `feat/sprint-2-academy`** (see the verification note at the end of this section).

**Goal:** free courses with professional video, without the referral gate yet.

- Courses, lessons, enrolment, progress APIs; admin seed script for the first course
- Frontend: course catalogue, course page, lesson page with YouTube facade, transcript, progress, resume
- CSP and security headers on the web app (report-only first), `Referrer-Policy` verified against the player
- Verify unlisted-video embeds play on the production domain (open question from ADR-0005)
- Performance budget measured on a throttled 3G profile; accessibility pass

**Done:** courses, sections, lessons, enrolment and progress APIs; validated content file with importer and
`npm run seed:academy`; catalogue, course, lesson (YouTube facade, transcript, resume) and "My learning" screens;
CSP in report-only mode plus `Referrer-Policy: strict-origin-when-cross-origin`; axe scan clean on three pages.
**Not done / not verifiable here:** unlisted-video embeds on the real domain (needs the domain and real video ids,
the two video lessons stay draft until then); Mongo repositories exercised only by the gated integration test;
throttled-3G run (bundle size measured, not timed); CSP enforcement (switch `REPORT_ONLY` after a clean production run);
nonces to replace `'unsafe-inline'`; the deleted-account purge job.

## Sprint 3 — Referral growth loop

**Goal:** free training unlocks through verified invitations (ADR-0002).

- Referral codes, attribution, events, verification-time checks, anti-abuse caps
- Unlock logic with a configurable threshold; alternative unlock (ambassador or partner code)
- Frontend: progress meter ("2 of 3 friends joined"), share sheet (WhatsApp, LinkedIn, X, Facebook, copy link, Instagram instructions)
- Funnel analytics: opens, registrations, verifications, unlocks, rejections by reason
- A/B test of threshold (3 versus 5), decided by data from the pilot cohort

**Acceptance highlights:** self-referral, duplicate email or phone, and disposable emails never count; a rejected
referral shows no reason to the referrer; the threshold changes without a deploy.

## Sprint 4 — Internship pipeline

**Goal:** supervised internships run through the platform.

- Postings, applications, review states, interviews, supervisor assignment, placement and agreement record
- Rule enforcement: no placement without a named supervisor; "applying does not guarantee a place" shown
- Applicant dashboard, status emails, withdrawal; reviewer notes visible to admins only
- Idempotency keys on application submission

## Sprint 5 — Admin console and the "breathtaking" pass

**Goal:** the founders can run the company without touching the database, and the site feels premium.

- Admin console: lead pipeline, content, users, referral funnel, internship review, exports; TOTP required
- Design system tokens, motion (respecting reduced motion), final brand colours and imagery
- Performance budget enforced in CI; Playwright end-to-end tests; axe accessibility checks
- Kinyarwanda translation of the core pages

## Sprint 6 — Hardening and launch

- External penetration test or structured review; fix findings
- Backup restore drill; incident drill using the runbook; uptime and error alerting
- Load test of registration, lesson and referral endpoints
- Launch gate completed; soft launch with a small pilot cohort; public launch after one clean week

## After launch (backlog, unscheduled)

Certificates with a public verification page; MTN MoMo and Airtel Money for paid products;
software-product storefront; low-bandwidth mode and offline notes; WhatsApp bot for reminders (with consent);
SMS verification; organisation accounts for schools and employers; native app.

## Cut list (what goes first if time runs short)

1. Kinyarwanda translation (move to a later sprint)
2. Motion and visual polish beyond the performance budget
3. Ambassador codes (keep the main referral path)
4. Funnel dashboard detail (keep raw counts)
   Never cut: consent and age handling, authentication hardening, audit log, backups, the launch gate.

## Risks to the schedule

| Risk                                            | Response                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Legal steps (RDB, NCSA) take longer than coding | Start Sprint 0 founder tasks today; build against synthetic data meanwhile                       |
| Email deliverability to Rwandan providers       | Test several mailbox providers in Sprint 1; keep a fallback of phone verification in the backlog |
| Founder availability drops                      | The plan degrades by cutting scope in the order above, not by skipping the launch gate           |
| YouTube changes embed behaviour                 | Keep video IDs in the database and the facade layer thin so the host can be swapped (ADR-0005)   |
