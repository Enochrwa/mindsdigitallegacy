# auth (planned: Sprint 1)

Registration, email verification, login, logout, password reset, session rotation, admin 2FA (TOTP).
Design: ADR-0004 (server-side sessions in httpOnly cookies) and `docs/03-lld.md` section 4.

Do not add JWT-in-localStorage or ad-hoc password handling here. argon2id only.
