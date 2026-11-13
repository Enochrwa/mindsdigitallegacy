import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditLog } from "../modules/audit/audit.js";
import type { AuthTokenRepository, TokenPurpose } from "../modules/auth/authTokens.js";
import type { Mailer } from "../modules/auth/mailer.js";
import type { NewSession, Session, SessionRepository } from "../modules/sessions/sessions.types.js";
import type { UserRepository } from "../modules/users/users.repository.js";
import { DuplicateEmailError } from "../modules/users/users.types.js";
import type { ConsentType, NewUser, User } from "../modules/users/users.types.js";

/** In-memory fakes for HTTP tests. Behaviour mirrors the Mongo repositories' contracts. */

export function memoryUsers(): UserRepository & { all: Map<string, User> } {
  const all = new Map<string, User>();
  const get = (id: string): User => {
    const user = all.get(id);
    if (user === undefined) throw new Error("no such user");
    return user;
  };
  return {
    all,
    create(input: NewUser) {
      if ([...all.values()].some((u) => u.email === input.email)) {
        return Promise.reject(new DuplicateEmailError());
      }
      const user: User = { ...input, id: randomUUID(), createdAt: new Date(), failedLogins: 0 };
      all.set(user.id, user);
      return Promise.resolve(user);
    },
    findByEmail: (email) =>
      Promise.resolve([...all.values()].find((u) => u.email === email) ?? null),
    findById: (id) => Promise.resolve(all.get(id) ?? null),
    markEmailVerified(id, at) {
      get(id).emailVerifiedAt = at;
      return Promise.resolve();
    },
    recordGuardianConsent(id, at, method) {
      const user = get(id);
      if (user.guardian) user.guardian = { ...user.guardian, consentAt: at, method };
      return Promise.resolve();
    },
    setPasswordHash(id, hash) {
      get(id).passwordHash = hash;
      return Promise.resolve();
    },
    incrementFailedLogins(id) {
      const user = get(id);
      user.failedLogins += 1;
      return Promise.resolve(user.failedLogins);
    },
    lockUntil(id, until) {
      get(id).lockedUntil = until;
      return Promise.resolve();
    },
    clearLoginState(id) {
      const user = get(id);
      user.failedLogins = 0;
      user.lockedUntil = undefined;
      return Promise.resolve();
    },
    setConsent(id, type: ConsentType, noticeVersion, at, granted) {
      const user = get(id);
      if (granted) user.consents.push({ type, noticeVersion, at });
      else
        for (const c of user.consents)
          if (c.type === type && c.withdrawnAt === undefined) c.withdrawnAt = at;
      return Promise.resolve();
    },
    softDelete(id, at) {
      get(id).deletedAt = at;
      return Promise.resolve();
    },
  };
}

export function memorySessions(): SessionRepository & { all: Map<string, Session> } {
  const all = new Map<string, Session>();
  return {
    all,
    create(input: NewSession) {
      const session: Session = { ...input, id: randomUUID() };
      all.set(session.id, session);
      return Promise.resolve(session);
    },
    findByTokenHash: (hash) =>
      Promise.resolve([...all.values()].find((s) => s.tokenHash === hash) ?? null),
    markRotated(id, at) {
      const s = all.get(id);
      if (s) s.rotatedAt = at;
      return Promise.resolve();
    },
    touch(id, lastUsedAt, expiresAt) {
      const s = all.get(id);
      if (s) Object.assign(s, { lastUsedAt, expiresAt });
      return Promise.resolve();
    },
    revokeFamily(family) {
      for (const [id, s] of all) if (s.family === family) all.delete(id);
      return Promise.resolve();
    },
    revokeAllForUser(userId, exceptFamily) {
      for (const [id, s] of all)
        if (s.userId === userId && s.family !== exceptFamily) all.delete(id);
      return Promise.resolve();
    },
  };
}

export function memoryAuthTokens(): AuthTokenRepository {
  const rows: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }[] = [];
  const find = (purpose: TokenPurpose, tokenHash: string, now: Date) =>
    rows.find(
      (r) =>
        r.purpose === purpose &&
        r.tokenHash === tokenHash &&
        r.usedAt === undefined &&
        r.expiresAt > now,
    );
  return {
    create(input) {
      rows.push({ ...input });
      return Promise.resolve();
    },
    peek: (purpose, hash, now) => Promise.resolve(find(purpose, hash, now)?.userId ?? null),
    consume(purpose, hash, now) {
      const row = find(purpose, hash, now);
      if (row === undefined) return Promise.resolve(null);
      row.usedAt = now;
      return Promise.resolve(row.userId);
    },
  };
}

export function memoryAudit(): AuditLog & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    append(event) {
      events.push(event);
      return Promise.resolve();
    },
  };
}

export interface SentMail {
  kind: "verify" | "reset" | "guardian" | "existing";
  to: string;
  token?: string;
}

export function memoryMailer(): Mailer & { sent: SentMail[] } {
  const sent: SentMail[] = [];
  return {
    sent,
    sendVerification(to, token) {
      sent.push({ kind: "verify", to, token });
      return Promise.resolve();
    },
    sendPasswordReset(to, token) {
      sent.push({ kind: "reset", to, token });
      return Promise.resolve();
    },
    sendGuardianConsent(to, _name, token) {
      sent.push({ kind: "guardian", to, token });
      return Promise.resolve();
    },
    sendExistingAccountNotice(to) {
      sent.push({ kind: "existing", to });
      return Promise.resolve();
    },
  };
}
