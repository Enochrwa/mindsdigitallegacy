# 07 — Data model (data dictionary)

Status: implemented for Sprint 1 (identity) and Sprint 2 (academy). Referral, certificates and quizzes are planned (section 8).
Source of truth in code: `backend/src/modules/*/**.types.ts` (domain), `*.model.ts` (Mongoose), `content.schema.ts` (authoring).

## 1. Principles (why the data looks like this)

1. **Closed vocabularies.** Every status, level, language and kind is a union type, validated by Zod at the edge and by a Mongoose `enum`. No free-text categories.
2. **Public slug, internal id.** URLs use a stable lower-case kebab `slug`; relations use the internal id. Renaming a title never breaks a link or a relation.
3. **Structured content, never HTML.** Lesson text is an array of typed blocks (`heading`, `paragraph`, `list`, `note`, `code`). The web app renders them; nothing is injected as HTML.
4. **Derived data has one derivation.** Course counters (`lessonCount`, `requiredLessonCount`, `totalDurationSec`) come only from `computeCourseStats` and are recomputed on every import.
5. **Explainable change.** Each course keeps `contentVersion` and an internal `contentHash`; the importer bumps the version only when content really changed.
6. **Retire, don't delete.** Lessons removed from the source file become `draft`; learner progress keeps pointing at a real row.
7. **Strict schemas.** Mongoose `strict: "throw"`: writing an unknown field is an error, not silent data loss.
8. **Idempotency by unique index.** One enrolment per (user, course); one progress row per (user, lesson). Retries and double clicks cannot duplicate.
9. **Personal data is minimal and purgeable.** Learning rows reference `userId` only and are part of the self-service export and the deletion cascade.

## 2. Entity overview

```
Category 1───* Course 1───* Section 1───* Lesson
                  │  ▲ prerequisiteIds (Course→Course)
                  │
User 1───* Enrolment *───1 Course
User 1───* LessonProgress *───1 Lesson   (courseId copied for one-query reads)
```

## 3. Collections

### categories
| Field | Type | Notes |
|---|---|---|
| slug | string, unique | kebab-case, stable |
| name, description | string | display text |
| order | int | display order |
| status | `active` \| `hidden` | hidden categories are not listed |

### courses
| Field | Type | Notes |
|---|---|---|
| slug | string, unique | public URL key |
| categoryId | ref categories | |
| title, summary | string | summary is the card text |
| description | ContentBlock[] | long description |
| level | `beginner` \| `intermediate` \| `advanced` | |
| language | `en` \| `rw` \| `fr` | one language per course |
| status | `draft` \| `published` \| `archived` | draft = invisible; archived = visible only to learners already enrolled |
| order | int | catalogue order |
| tags | string[] | slugs, used for filtering |
| outcomes, audience | string[], string | what you will learn / who it is for |
| prerequisiteIds | ref courses[] | advisory, not enforced |
| instructors | {name, role?}[] | embedded until a real instructor entity is needed |
| unlockPolicy | `{open}` \| `{referral, threshold}` \| `{code}` | how access is granted (ADR-0002) |
| stats | {lessonCount, requiredLessonCount, totalDurationSec} | derived, never hand-edited |
| contentVersion, contentHash | int, string | change tracking (hash is internal, never in API) |
| publishedAt, archivedAt | date | lifecycle timestamps |

Indexes: unique slug; (status, categoryId, order); (status, level); (status, tags).

### sections
courseId, order (unique with courseId), title, summary?. Groups lessons in the outline.

### lessons
| Field | Type | Notes |
|---|---|---|
| courseId, sectionId | refs | |
| order | int | reading order across the course; drafts keep their slot |
| slug | string | unique within a course |
| title, summary | string | |
| kind | `video` \| `reading` | |
| status | `draft` \| `published` | only published lessons reach learners |
| required | bool | counts toward course completion |
| isPreview | bool | readable without enrolment (published courses only) |
| video | {provider:`youtube`, videoId, durationSec}? | id matches `^[A-Za-z0-9_-]{11}$`; only returned to unlocked learners or on previews (ADR-0005) |
| body | ContentBlock[] | |
| transcript | {language, paragraphs[]}? | accessibility and low-bandwidth |
| resources | {title, url (https)}[] | |

Indexes: unique (courseId, slug); (courseId, status, order).

### enrolments
| Field | Type | Notes |
|---|---|---|
| userId, courseId | refs | unique together |
| status | `active` \| `completed` \| `withdrawn` | |
| access | {state: `locked`\|`unlocked`, unlockedAt?, via?: `open`\|`referral`\|`code`\|`admin`} | why and when access was granted |
| enrolledAt, completedAt?, withdrawnAt? | dates | |
| lastLessonId, lastActivityAt | | powers "continue where you left off" |

### lessonprogresses
userId, courseId, lessonId (unique with userId), status `in_progress` \| `completed`, positionSec? (reserved; the web player does not report it), firstStartedAt, lastActivityAt, completedAt?.

## 4. Lifecycles

- **Course:** draft → published → archived (and back to published). Draft never visible.
- **Enrolment:** active ⇄ completed (automatic: completed when every required published lesson is complete; reopened if one is un-completed); active/completed → withdrawn → active (re-enrol restores the same row and its progress).
- **Access:** locked → unlocked (open policy: immediately; referral/code: by the Sprint 3 unlock flow).

## 5. Invariants (enforced in code and tests)

- A learner reads lesson content only with an unlocked, non-withdrawn enrolment, or on a published free-preview lesson.
- Progress writes require an unlocked enrolment and only touch the caller's own rows.
- Draft courses/lessons return 404. Archived courses 404 unless the caller is enrolled.
- Completion percentage counts only published, required lessons.

## 6. Data quality rules for authored content

`backend/content/academy.json` is validated before any import (`npm run check:academy`): unique slugs, known category and prerequisite, no self-prerequisite, published video lessons need a video, reading lessons cannot have video, published reading lessons need body, previews must be published, a published course needs ≥1 published and ≥1 required lesson. All problems are reported together.

## 7. Personal data and deletion

Personal: `enrolments`, `lessonprogresses` (user-linked). Included in `GET /users/me/export`. Purged with the user after the grace period by the purge job (`modules/retention`, Sprint 5b).

### 7.1 Purge rules (what happens when an account is permanently removed)

The job runs hourly in the API process (`ACCOUNT_PURGE_INTERVAL_MINUTES`) or from cron (`npm run purge:accounts`, `--dry` to preview). Grace period: `ACCOUNT_PURGE_GRACE_DAYS`, default 30 (**confirm the period with counsel**). It only ever touches rows that are soft-deleted, handles a batch at a time, is safe to run twice, and removes the user row last so a half-finished purge is retried.

| Collection | On purge |
| --- | --- |
| `users` | Deleted (last) |
| `sessions`, `authtokens` | Deleted |
| `enrolments`, `lessonprogresses` | Deleted |
| `entitlements`, `redemptions` | Deleted |
| `referralcodes` | Deleted |
| `internshipapplications`, `internshipplacements` | Deleted, including reviewer notes and supervisor feedback about the person |
| `referrals` where the person was the **invitee** | Deleted |
| `referrals` where the person was the **referrer** | Kept: the row holds the invitee's data; the referrer id no longer resolves to anyone |
| `referralevents` | Kept for funnel statistics; the person's ids are removed |
| `auditevents` | Kept as the security record: ids only, never emails. One `system.account.purge` event is added per account |
| `leads` | Not user-linked; removed by their own retention (`LEAD_RETENTION_DAYS`) |

## 8. Sprint 3 collections and changes

| Collection | Purpose | Notes |
| --- | --- | --- |
| `referralcodes` | One code per learner (8 chars, no look-alike characters) | `assignedThreshold` pins the A/B variant; `status` active/disabled |
| `referrals` | One row per invitee | Unique on invitee. Status pending/qualified/needs_review/rejected/revoked plus an internal reason the referrer never sees |
| `referralevents` | Append-only funnel log | visit, attributed, qualified, needs_review, rejected, approved, revoked, unlocked, each with variant |
| `entitlements` | Why someone has free access | scope all/course, via referral/code/admin, revocable. Courses unlock and re-lock from this |
| `unlockcodes`, `unlockredemptions` | Ambassador, partner and promo codes | Atomic use counting; one redemption per person per code |
| `settings` | Single versioned document | Optimistic concurrency (`STALE_SETTINGS`) |

Changed: `users` (roles support/editor, `suspendedAt`, encrypted `totp`), `sessions` (`mfaVerifiedAt`), `leads`
(pipeline fields, notes), `courses`/`categories` (`source` file or admin), `audit` (new actions, indexes).

## 9. Planned extensions (designed to fit without migration pain)

- Quizzes and certificates: new collections keyed by lessonId / enrolmentId.
- Instructors as a collection: replace the embedded array with refs.
- Content revisions: store a snapshot per `contentVersion` if editorial history is needed.
- Translations: a course per language linked by a shared `translationGroup` field.

## 9. Internship collections (Sprint 4)

| Collection | Holds | Notable indexes and rules |
| --- | --- | --- |
| `internshippostings` | Title, department, description, requirements, learning goals, mode, location, weeks, hours, pay terms, minimum age (16 or 18), slots, supervisor ids, status (`draft`, `published`, `closed`), open and close dates | Unique `slug`; slots may not exceed supervisors x per-supervisor limit when published |
| `internshipapplications` | Applicant, statement, https links, availability, `under18`, guardian (name, relationship, contact, verification), status, `events[]` (history), `notes[]` (staff only), message to applicant, consent version, agreement acceptance | **Unique `{postingId, userId}`** (idempotent apply); status changes are compare-and-set |
| `internshipplacements` | Application, posting, intern, supervisor, dates, status (`active`, `completed`, `ended_early`, `cancelled`), agreement version, `feedback[]` (with `visibleToIntern`), outcome summary | **Unique `applicationId`**; only an active placement can end or take feedback |

Personal data: applications and placements are personal data. They are in the user export (applicant view, no
notes), removed on account purge, and the guardian's contact details are kept only for under-18 applicants.

## 10. Sign-in provider accounts (social sign-in)

| Collection | Holds | Rules |
| --- | --- | --- |
| `oauthidentities` | `userId`, `provider`, `subject` (the provider's id), the `email` the provider showed, `lastUsedAt` | Unique `{provider, subject}` and `{userId, provider}`. Deleted on account purge. Listed in the person's data export (provider and email only) |

A social-only account has an empty `passwordHash`. It cannot pass a password check, and can add a password later with "Forgot password".
No provider access tokens or refresh tokens are stored: they are used once during sign-in and discarded.
