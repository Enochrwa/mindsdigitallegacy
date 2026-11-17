# Internships module (Sprint 4)

Supervised internships, end to end: postings, applications, staff review, placements and supervisor feedback.
Proposal anchor: section 4.3 (no guarantees, no placement without a supervisor, age safeguards, limited intern numbers).

## Rules the code enforces (not just documents)

| Rule | Where it lives | Test |
| --- | --- | --- |
| Applying never guarantees a place; the notice ships with every posting and every status text | `internships.dto.ts`, `lib/internships.ts` (frontend) | `internships.test.ts`, `internships.test.ts` (frontend) |
| One application per person per posting; a double submit returns the first one | Unique index `{postingId, userId}`, `apply()` | "is idempotent" |
| Only legal status moves, by the right actor | `MOVES` table in `internships.rules.ts` | exhaustive test over every from/to/actor pair |
| Two reviewers (or two clicks) cannot apply the same move twice | Compare-and-set `transition()` (filter on current status) | "applies each move once", Mongo integration test |
| No placement without: accepted offer, accepted agreement, verified guardian (if under 18), a supervisor on the posting with spare capacity, a free slot, sane dates | `checkPlacement()` | "placement checks", HTTP tests |
| A posting can only be published with a supervisor and `slots <= supervisors x INTERNSHIP_MAX_PER_SUPERVISOR` | `assertCapacity()` | "cannot publish without a supervisor or beyond capacity" |
| Under-16 accounts cannot apply; under-18 applicants must name a guardian; adults cannot | `checkEligibility()` | eligibility tests |
| Reviewer notes and scores never reach the applicant, the export, emails, or audit details | Allow-list DTOs per audience | "never shows reviewer notes, scores or staff ids" |
| Another person's application is a 404 for every action | `myApplication()` | "returns 404 for someone else's application" |
| Emails carry fixed text only | `INTERNSHIP_COPY` in `mailTemplates.ts` | "emails the applicant fixed text only" |
| Same application cannot be placed twice, even concurrently | CAS claim `accepted -> placed`, unique index on `applicationId` | "cannot place the same application twice" |

## Status machine

```
submitted -> shortlisted -> interview -> offered -> accepted -> placed
     |            |             |           |           |
     +-> rejected +-> rejected  +-> rejected+-> rejected+-> rejected     (staff)
     +-> withdrawn (applicant, any step before placed; declining an offer is a withdrawal)
offered -> accepted : applicant only, with the current agreement version
accepted -> placed  : system only, as part of a guarded placement
rejected, withdrawn, placed : final
```

## HTTP surface

Public / applicant (`/api/v1`): `GET /internships`, `GET /internships/:slug`, `POST /internships/:slug/apply`,
`GET /internships/applications/me`, `GET|POST /internships/applications/:id[/withdraw|/accept]`,
`GET /internships/placements/me`.
Supervisor: `GET /supervisor/placements`, `POST /supervisor/placements/:id/feedback`.
Staff (`/api/v1/admin/internships/...`, second factor required): `stats`, `supervisors`, `postings` (CRUD, publish, close),
`applications` (list, detail, `transition`, `notes`, `verify-guardian`, `place`, `export.csv`), `placements` (list, detail, `end`, `supervisor`).

Permissions: `internships:read`, `:write` (postings), `:review` (status and notes), `:place` (placement, guardian, end),
`:supervise` (supervisors, not staff). Admin has all; support has read and review.

## Things to know

- **Supervisors are not staff.** They have no console and no second factor today. They see only their own
  interns (name and email) and can write feedback on their running placements. Add MFA for supervisors if the
  programme grows (backlog).
- **Changing someone's roles signs them out** (existing security behaviour). A new supervisor must sign in again.
- **The intern role** is added when a placement is created and removed when their last active placement ends.
- **Account deletion** removes the person's applications and placements (including notes about them) when the
  grace period ends (`modules/retention`, docs/07 section 7.1).
- **The intern agreement is a draft** (`AGREEMENT_VERSION` here and `AGREEMENT_DRAFT` in the frontend must match).
  A Rwandan lawyer must approve the text before real use (sprint plan F5, F6).
- Mongo repositories are covered by `internships.integration.test.ts`, which runs when `MONGODB_TEST_URI` is set.
