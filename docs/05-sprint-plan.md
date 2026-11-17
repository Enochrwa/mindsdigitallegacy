# 05 — Sprint Plan

> Status: **v0.2** · 2026-11-16 · replaces v0.1 (2026-11-13). Two founders, part-time. Sprints are two weeks,
> planned for about 20 focused hours per person (**40 team-hours; commit to about 28**, keeping 30% for review,
> bugs and the unexpected). Story-level detail, estimates and acceptance criteria live in
> [`10-sprint-backlog.md`](10-sprint-backlog.md). This file is the map; that file is the work.

## 1. Where we really are (verified 2026-11-16)

Checked by cloning `main` at `df298b5` and running the toolchain on Node 24.

| Check                                   | Result                                                           |
| --------------------------------------- | ---------------------------------------------------------------- |
| Backend typecheck, lint                 | Clean                                                            |
| Backend tests                           | 211 passed, 8 skipped (the real-MongoDB integration file)        |
| Backend `npm audit --omit=dev`          | 0 vulnerabilities                                                |
| Frontend typecheck                      | Clean                                                            |
| Frontend lint                           | 0 errors, 7 warnings (react-refresh in `ui/` files)              |
| Frontend tests, production build        | 59 passed; build succeeds (Cloudflare module preset)             |
| Not verified here                       | GitHub Actions run history, Docker build, live email, real MongoDB, production CSP behaviour |

Note: the backend needs Node 24 or newer (`engine-strict=true`). On Node 22, 83 tests fail for that reason alone.

### Sprint status after reconciliation

| Sprint | Theme                          | State                | What is left (carried into Sprint 5b unless noted)                                                                                                               |
| ------ | ------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Foundations                    | Code done            | Founder tasks: branch protection, 2FA, RDB name search, domain, handles, YouTube channel, answers to the seven open decisions                                       |
| 1      | Accounts, consent, first form  | About 90% done       | Live email provider and SPF/DKIM/DMARC; real test mail; Mongo integration job confirmed green in CI; ~~purge job~~ (built, see doc 10); browser test of auth screens |
| 2      | Academy MVP                    | About 90% done       | Real video IDs and unlisted-embed check on the real domain; CSP enforcement; nonces replacing `unsafe-inline`; throttled-3G timing; Mongo repository integration tests |
| 3      | Referral loop and admin console| About 95% done       | A/B threshold winner (needs pilot data, so it moves to Sprint 7)                                                                                                  |
| 4      | Internship pipeline            | **Not started**      | Whole sprint; only `modules/internships/README.md` exists                                                                                                         |
| 5      | Admin console and polish       | About 80% done       | Internship review (depends on Sprint 4); CI performance budget; axe in CI; Playwright E2E; Kinyarwanda; motion pass; format-only commit                            |
| 6      | Hardening and launch           | Not started          | Whole sprint                                                                                                                                                      |

## 2. Calendar

Assumes Rwandan public holidays on 25 and 26 December and 1 and 2 January (confirm), and reduced capacity over the
holiday weeks. Dates are targets, not promises; the launch gate decides the real launch date.

| Sprint | Dates                  | Name                                  | Capacity                 |
| ------ | ---------------------- | ------------------------------------- | ------------------------ |
| 4      | 16 Nov to 27 Nov       | Internship pipeline                   | 40 h (28 committed)      |
| 5b     | 30 Nov to 11 Dec       | Close-out and quality gates           | 40 h (28 committed)      |
| 6      | 14 Dec to 8 Jan        | Security hardening (3 weeks, holidays)| 45 h (31 committed)      |
| 7      | 11 Jan to 22 Jan       | Pilot cohort and launch readiness     | 40 h (28 committed)      |
| Launch | Target week of 25 Jan  | Public launch after one clean pilot week and a passed launch gate | n/a |

## 3. Two tracks, run in parallel

Code is not the long pole; paperwork is. The founder track starts today because several items have lead times of
weeks.

### Founder track (non-code), ordered by lead time

| #   | Task                                                                                 | Owner     | Start   | Lead time (to confirm)                      |
| --- | ------------------------------------------------------------------------------------ | --------- | ------- | ------------------------------------------- |
| F1  | Answer the seven open decisions in `01-research-and-gap-analysis.md` section 11      | Both      | Now     | One sitting, 2 hours                        |
| F2  | RDB name search and reservation (3 names), then registration; TIN comes in the same flow | Founder A | Now | Sources say hours to a few days online; fees quoted vary (free to RWF 25,000), so check on the RDB portal |
| F3  | Name the data protection officer; start NCSA controller registration                 | Both      | Now     | Up to 30 days from receipt of a complete application (Hogan Lovells); also needs the legal name from F2 |
| F4  | Decide hosting for personal data (ADR-0003): Rwanda IaaS or NCSA-authorised offshore | Both      | Week 1  | Needs a lawyer's view; blocks Sprint 6 backups |
| F5  | Rwandan lawyer reviews privacy notice, terms, guardian-consent text, intern terms    | Founder B | Week 2  | 2 to 4 weeks; book now                      |
| F6  | Read the Internship Guidelines (2020) in full; decide paid, stipend or unpaid        | Founder B | Week 1  | 1 week                                      |
| F7  | Domain, sender domain (SPF, DKIM, DMARC), YouTube channel, social handles, 2FA on all accounts | Founder A | Week 1 | Days |
| F8  | Founders' agreement: equity, roles, IP ownership, exit (the proposal itself says written agreements first) | Both | Week 2 | 1 to 2 weeks with a lawyer |
| F9  | Record the first two or three course videos (real IDs unlock Sprint 2 verification)  | Founder B | Week 2  | Ongoing                                     |
| F10 | Business bank account and mobile-money receiving number (needed before any paid product) | Founder A | After F2 | 1 to 2 weeks                              |

Why the legal items matter: Law No. 058/2021 requires controllers and processors to register with the NCSA, and
personal data must be stored in Rwanda unless the registration certificate authorises storage or transfer abroad
(DLA Piper summary). Operating without registration carries fines of RWF 2,000,000 to 5,000,000 or 1% of prior-year
revenue (secondary source; confirm with counsel). Breach notification to the NCSA is within 48 hours.

### Engineering track

See section 4 and `10-sprint-backlog.md`.

## 4. Sprint goals

| Sprint | Goal in one sentence                                                                                           | Demo at the end                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 4      | Supervised internships run end to end on the platform, with the supervisor rule enforced in code.              | Apply, review, interview, assign supervisor, place, withdraw; admin sees it all  |
| 5b     | Everything promised in Sprints 1 to 3 and 5 is actually finished, tested in a browser and gated in CI.         | Green pipeline with E2E, accessibility and performance gates; live test email    |
| 6      | A hostile reviewer cannot find a high-severity issue, and we can restore from backup and respond to an incident. | Restore drill, incident drill, scan and review reports with findings closed      |
| 7      | A small real cohort uses the product under the launch gate; we decide the referral threshold from data.         | Pilot funnel dashboard; go or no-go meeting                                      |

## 5. Launch gate (blocks real registrations; does not block building)

Unchanged in intent from v0.1, now with owners and the sprint where each is closed.

- [ ] Company registered with RDB; brand, domain and handles secured (F2, F7)
- [ ] NCSA registration submitted; data protection officer named (F3)
- [ ] ADR-0003 Accepted; database location lawful (F4); backups in Rwanda
- [ ] Privacy notice, terms, guardian consent and intern terms reviewed by a Rwandan lawyer (F5)
- [ ] Internship Guidelines (2020) read; intern terms drafted (F6)
- [ ] Founders' agreement signed (F8)
- [ ] 2FA on every critical account; recovery access shared (F7)
- [ ] Backups configured and one restore tested; uptime and error alerting on (Sprint 6)
- [ ] Structured security review done, High and Critical findings fixed (Sprint 6)
- [ ] CSP enforced with a clean production run; reports collected (Sprint 5b, 6)
- [ ] Real email delivery verified to Gmail, Outlook and at least one Rwandan mailbox provider (Sprint 5b)
- [ ] Unlisted-video embeds verified on the production domain (Sprint 5b)

## 6. Principles (kept from v0.1, tightened)

1. Ship a thin vertical slice every sprint that a real person can use.
2. Nothing that collects real personal data goes live before the launch gate.
3. Every story has acceptance criteria and a test. Security stories are not optional extras.
4. Offer only what MDL can deliver (proposal stage 1). The site shows "open now" and "coming soon" honestly.
5. Cut scope, never quality or security.
6. **Definition of Done** (section 7) applies to every story; a story that fails it is not done.
7. No new dependency without a one-line justification in the PR (supply-chain risk is real; see Sprint 6).

## 7. Definition of Done

- Code reviewed by the other founder (or self-reviewed against the PR checklist until the co-founder has repo access)
- Typecheck, lint, tests and build green in CI; new behaviour has a test, including a negative or abuse case
- No new high or critical audit findings; no secrets in the diff
- Docs updated: the module README, `07-data-model.md` for schema changes, an ADR for decisions
- Accessible: keyboard operable, labelled, contrast checked on new UI
- Logged and audited: security-relevant actions produce an audit event; no personal data in logs
- Works on a throttled mobile profile for learner-facing pages

## 8. Cut list (what goes first if time runs short)

1. Kinyarwanda translation (move after launch; ship English with a Kinyarwanda summary page)
2. Motion and visual polish beyond the performance budget
3. Ambassador codes (keep the main referral path)
4. Funnel dashboard detail (keep raw counts)
5. Interview scheduling inside the platform (use email and a manual status)

**Never cut:** consent and age handling, authentication hardening, the audit log, backups, the launch gate.

## 9. Risks to the schedule

| Risk                                                                 | Likelihood | Impact | Response                                                                                       |
| -------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| NCSA registration or lawyer review takes longer than coding          | High       | High   | Start F3 and F5 this week; build on synthetic data; launch date follows the gate               |
| Two part-time founders; one is unavailable for a sprint              | Medium     | High   | Plan to 70% capacity; cut list order; keep CODEOWNERS and bus-factor docs current               |
| Co-founder not yet a repo collaborator, so no second reviewer        | High       | Medium | Add them in week 1; until then require green CI plus a written self-review in each PR            |
| Supply-chain compromise of a dependency or workflow (2026 incidents) | Medium     | High   | Sprint 5b and 6 hardening stories (H-series); cooldowns, SHA pins, workflow linting             |
| Email deliverability to Rwandan mailboxes                            | Medium     | Medium | Test early in Sprint 5b; fallback of phone verification stays in the backlog                    |
| Referral gate abused with fake signups                               | Medium     | Medium | Already built: caps, disposable-domain list, review queue; tune thresholds in the pilot         |
| Free training attracts load before capacity exists                   | Low        | Medium | Cohort-based opening; waitlist; rate limits; load test in Sprint 6                              |
| YouTube changes embed behaviour or flags a video                     | Low        | Medium | Video IDs live in the database; facade layer is thin; keep a second host option (ADR-0005)       |
| Burnout from running both tracks                                     | Medium     | High   | Fixed weekly rhythm (section 10); one no-work day each week                                     |

## 10. Weekly rhythm

| When          | What                                                                   | Time   |
| ------------- | ---------------------------------------------------------------------- | ------ |
| Sprint day 1  | Planning: pick stories from the backlog up to 28 hours                  | 1 h    |
| Mon and Thu   | 15-minute stand-up (call or chat): done, next, blocked                  | 30 min/wk |
| Sprint day 10 | Demo on staging, then retrospective (what to start, stop, keep)         | 1.5 h  |
| Monday        | Merge the weekly Dependabot PRs after reading what changed              | 30 min |
| Friday        | Update the founder checklist and the status table in this file          | 15 min |

## 11. After launch (backlog, unscheduled)

Certificates with a public verification page; MTN MoMo and Airtel Money for paid products; software-product
storefront; low-bandwidth mode and offline notes; WhatsApp reminders (with consent); SMS verification;
organisation accounts for schools and employers; native app; mentor and partner portal (proposal section 8).
