/**
 * Roles are coarse job titles; what each may do is decided in modules/auth/permissions.ts.
 *  - learner, intern: self-service only
 *  - supervisor: reserved for the internship programme (Sprint 4)
 *  - support: reads users, leads and referrals, handles the review queue
 *  - editor: manages academy content
 *  - admin: everything, including roles and settings
 */
export const ROLES = ["learner", "intern", "supervisor", "support", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type ConsentType = "service" | "marketing";

export interface Consent {
  type: ConsentType;
  noticeVersion: string;
  at: Date;
  withdrawnAt?: Date | undefined;
}

/** Authenticator-app second factor. The secret is stored encrypted; recovery codes only as hashes. */
export interface TotpState {
  secretEnc: string;
  /** Unset until the first code is confirmed, so a half-finished setup protects nothing. */
  enabledAt?: Date | undefined;
  recoveryHashes: string[];
  /** Last accepted 30-second step, so one code cannot be replayed. */
  lastStep?: number | undefined;
}

export interface User {
  id: string;
  email: string;
  emailVerifiedAt?: Date | undefined;
  passwordHash: string;
  displayName: string;
  phone?: string | undefined;
  roles: Role[];
  ageBracket: "under_16" | "16_plus";
  guardian?:
    { email: string; consentAt?: Date | undefined; method?: string | undefined } | undefined;
  consents: Consent[];
  failedLogins: number;
  lockedUntil?: Date | undefined;
  deletedAt?: Date | undefined;
  /** Set by staff. A suspended account cannot sign in and its sessions are revoked. */
  suspendedAt?: Date | undefined;
  suspendedReason?: string | undefined;
  totp?: TotpState | undefined;
  createdAt: Date;
}

export type NewUser = Omit<User, "id" | "createdAt" | "failedLogins">;

/** Active = verified email, guardian consent when under 16, and not deleted. */
export function isActive(user: User): boolean {
  if (user.deletedAt !== undefined || user.suspendedAt !== undefined) return false;
  if (user.emailVerifiedAt === undefined) return false;
  if (user.ageBracket === "under_16" && user.guardian?.consentAt === undefined) return false;
  return true;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("duplicate email");
    this.name = "DuplicateEmailError";
  }
}
