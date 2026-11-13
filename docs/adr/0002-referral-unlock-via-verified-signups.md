# ADR-0002: Unlock free training with verified referral signups, not claimed shares

- Status: Accepted
- Date: 2026-11-13

## Context

Founders want free training to require sharing and inviting 5 or 10 people on WhatsApp, LinkedIn, X,
Instagram or Facebook. None of these platforms tells MDL whether a user actually posted or messaged
anyone, so "proof of sharing" cannot be verified. Evidence in `01-research-and-gap-analysis.md` section 7.

## Decision

1. Each learner gets a unique, unguessable referral link (`/r/<code>`).
2. A referral **counts** only when the invited person registers **and verifies** an email or phone number,
   and passes anti-abuse checks.
3. The learner unlocks the course when the count reaches a **configurable threshold** (default 3, to be
   A/B tested against 5).
4. Sharing is done only through the user's own share sheet or by copying the link. MDL never reads contacts
   and never messages anyone on the user's behalf.
5. Alternative unlock paths exist so low-data learners are not excluded: ambassador code, partner-institution
   code, and a free first module for everyone.

## Anti-abuse rules

No self-referral (same account, same verified email or phone); disposable-email domain blocklist;
per-IP and per-code velocity limits; unlock delayed until the invitee verifies; flags for review (many
signups from one network in a short time); invitee must be a distinct person; referrals revoked on fraud.
Rewards are access only, never cash.

## Consequences

- Growth is slower than "claimed share" gating but measurable and honest.
- We store referral events (code, invitee user, timestamps), which is personal data and needs consent text.
- Marketing messages to invitees are not sent unless they opt in.
- Under-16 users cannot be invited into marketing flows; guardian consent applies.
