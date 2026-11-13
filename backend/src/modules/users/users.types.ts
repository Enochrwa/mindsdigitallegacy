export const ROLES = ["learner", "intern", "supervisor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type ConsentType = "service" | "marketing";

export interface Consent {
  type: ConsentType;
  noticeVersion: string;
  at: Date;
  withdrawnAt?: Date | undefined;
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
  createdAt: Date;
}

export type NewUser = Omit<User, "id" | "createdAt" | "failedLogins">;

/** Active = verified email, guardian consent when under 16, and not deleted. */
export function isActive(user: User): boolean {
  if (user.deletedAt !== undefined) return false;
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
