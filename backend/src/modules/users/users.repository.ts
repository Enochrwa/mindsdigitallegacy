import type { ConsentType, NewUser, User } from "./users.types.js";

/** Persistence port for users. Implemented with MongoDB in production and in memory for HTTP tests. */
export interface UserRepository {
  /** Throws DuplicateEmailError when the (lower-cased) email already exists, including soft-deleted rows. */
  create(user: NewUser): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  markEmailVerified(id: string, at: Date): Promise<void>;
  recordGuardianConsent(id: string, at: Date, method: string): Promise<void>;
  setPasswordHash(id: string, passwordHash: string): Promise<void>;
  /** Atomically increments and returns the new count. */
  incrementFailedLogins(id: string): Promise<number>;
  lockUntil(id: string, until: Date): Promise<void>;
  clearLoginState(id: string): Promise<void>;
  setConsent(
    id: string,
    type: ConsentType,
    noticeVersion: string,
    at: Date,
    granted: boolean,
  ): Promise<void>;
  softDelete(id: string, at: Date): Promise<void>;
}
