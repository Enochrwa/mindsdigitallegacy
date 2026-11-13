export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  /** All sessions descended from one login share a family; reuse of a rotated id revokes the family. */
  family: string;
  createdAt: Date;
  lastUsedAt: Date;
  /** Idle expiry, pushed forward on use but never beyond absoluteExpiresAt. */
  expiresAt: Date;
  absoluteExpiresAt: Date;
  rotatedAt?: Date | undefined;
  userAgentSummary: string;
  ipPrefix: string;
}

export type NewSession = Omit<Session, "id" | "rotatedAt">;

export interface SessionRepository {
  create(session: NewSession): Promise<Session>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  markRotated(id: string, at: Date): Promise<void>;
  touch(id: string, lastUsedAt: Date, expiresAt: Date): Promise<void>;
  revokeFamily(family: string): Promise<void>;
  /** Revokes every session of a user, optionally keeping one family (used on password reset). */
  revokeAllForUser(userId: string, exceptFamily?: string): Promise<void>;
}
