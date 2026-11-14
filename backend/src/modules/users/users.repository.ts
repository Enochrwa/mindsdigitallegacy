import type { Page, PageRequest } from "../../core/page.js";
import type { ConsentType, NewUser, Role, TotpState, User } from "./users.types.js";

export type UserStatus = "active" | "unverified" | "suspended" | "deleted";

export interface UserListQuery extends PageRequest {
  /** Matches the start of the email or any part of the display name, case-insensitively. */
  q?: string | undefined;
  role?: Role | undefined;
  status?: UserStatus | undefined;
}

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
  /** Staff operations (admin console). */
  list(query: UserListQuery): Promise<Page<User>>;
  setRoles(id: string, roles: Role[]): Promise<void>;
  setSuspended(id: string, at: Date | undefined, reason?: string): Promise<void>;
  setTotp(id: string, totp: TotpState | undefined): Promise<void>;
  countWithRole(role: Role): Promise<number>;
  countAll(): Promise<{ total: number; verified: number; suspended: number }>;
  signupsByDay(since: Date): Promise<{ day: string; count: number }[]>;
}
