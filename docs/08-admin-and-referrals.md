# Admin console, access model and referrals (Sprint 3)

## Running it

- First admin: the person registers and verifies their email, then someone with database access runs
  `npm run admin:grant -- person@example.rw` (optionally a role: `editor`, `support`). There is no way to become staff from the website.
- On first staff sign-in the console forces two-step verification setup (authenticator app + 10 one-time recovery codes).
  A fresh verification is required every 12 hours and after every new sign-in.
- Production needs `TOTP_ENCRYPTION_KEY` (32+ random characters). It encrypts TOTP secrets at rest (AES-256-GCM). Losing it means every
  staff member must reset two-step verification, so store it with the other secrets.
- Local trial without a database: `npm run dev:memory` seeds `admin@example.rw` / `correct horse battery` with a fixed dev secret
  printed in the log. Never exposed in production builds.

## Roles

| Role | Can |
| --- | --- |
| admin | everything, including roles, settings, exports |
| editor | courses, lessons, categories, analytics |
| support | leads, referral review, read users and enrolments, analytics |

Guards: you cannot change your own roles or suspend yourself; the last admin cannot be removed; role changes and suspension sign the person out everywhere.
The server decides which console modules exist per person (`GET /api/v1/admin/meta`), and only after two-step verification.

## Access model

`entitlements` decide who may open gated courses (via referral, unlock code or an admin grant). Revoking one re-locks courses it alone
covered; it never changes a course to open. Codes fail with one generic error so they cannot be probed.

## Referral rules (ADR-0002)

A friend counts when their email is verified (or guardian consent given). They do not count when: same person (including plus-tag and
dotted Gmail variants), disposable domain, duplicate contact, too many from one network (/24), a code collecting too many sign-ups in a day
(held for review), or an inactive account. Referrers never see why. Staff approve or reject held cases. All thresholds and limits are
settings, changeable without a deploy. Rejecting a qualified referral revokes the unlock.

## Admin API

All under `/api/v1/admin`, session cookie + `X-Requested-With: mdl-web` on mutations, every change audited:
`mfa/*`, `meta`, `overview`, `users*`, `entitlements/:id`, `categories`, `courses*`, `lessons*`, `leads*`, `referrals*`, `referral-codes*`,
`unlock-codes*`, `enrolments`, `settings`, `audit`, `export/:kind` (CSV, formula-injection safe, capped at 5000 rows).

## Known limits

Lessons and sections cannot be deleted or sections reordered through the API (lessons are retired by returning them to draft). CSV filters apply to leads only.
