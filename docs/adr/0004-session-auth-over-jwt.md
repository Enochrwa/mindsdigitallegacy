# ADR-0004: Server-side sessions in httpOnly cookies, not JWTs in browser storage

- Status: Accepted
- Date: 2026-11-13

## Context

The web app and API will share a registrable domain (for example `app.example.rw` and `api.example.rw`), so
cookies work as first-party cookies. The main web threats for a learner and intern portal are XSS token theft
and session fixation. Admin accounts must be revocable instantly.

## Decision

- Opaque random session IDs (at least 256 bits), stored **hashed** in MongoDB with user, expiry, rotation
  counter, and coarse device info.
- Cookie flags: `HttpOnly; Secure; SameSite=Lax; Path=/`, with the `__Host-` prefix where the domain setup allows.
- Session ID rotated on login, privilege change and on a fixed interval. Reuse of a rotated ID revokes the
  whole session family.
- **CSRF:** `SameSite=Lax`, `Origin` allow-list check on every state-changing request, JSON-only bodies, and a
  required custom header on authenticated mutations.
- Passwords hashed with argon2id. Login has per-account and per-IP throttling with backoff and a generic error.
  Admins require a second factor (TOTP) before any admin route is enabled.
- No tokens in `localStorage` or `sessionStorage`.

## Consequences

- One database read per authenticated request (cacheable later).
- A future native app needs a token flow; add it then, behind the same service interface.
- Cross-site embedding of the API is not supported, which is intended.
