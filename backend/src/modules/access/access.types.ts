import type { Page } from "../../core/page.js";
/**
 * Access model. An Entitlement says "this learner may open gated courses", and why. Courses that are
 * open need none. Keeping the reason (via) and the source makes every unlock explainable and revocable.
 */
export type EntitlementScope = { type: "all" } | { type: "course"; courseId: string };
export type EntitlementVia = "referral" | "code" | "admin";

export interface Entitlement {
  id: string;
  userId: string;
  scope: EntitlementScope;
  via: EntitlementVia;
  /** Referral: nothing. Code: the unlock code id. Admin: nothing. Lets a revocation target the right grant. */
  sourceId?: string | undefined;
  grantedBy?: string | undefined;
  note?: string | undefined;
  grantedAt: Date;
  revokedAt?: Date | undefined;
  revokedBy?: string | undefined;
}

export const covers = (e: Entitlement, courseId: string): boolean =>
  e.revokedAt === undefined && (e.scope.type === "all" || e.scope.courseId === courseId);

export interface EntitlementRepository {
  /** Idempotent on (user, scope, via, source): an active identical grant is returned unchanged. */
  grant(
    input: Omit<Entitlement, "id" | "revokedAt" | "revokedBy">,
  ): Promise<{ entitlement: Entitlement; created: boolean }>;
  listForUser(userId: string): Promise<Entitlement[]>;
  revoke(id: string, at: Date, by?: string): Promise<void>;
  findById(id: string): Promise<Entitlement | null>;
}

export const UNLOCK_CODE_KINDS = ["ambassador", "partner", "promo"] as const;
export type UnlockCodeKind = (typeof UNLOCK_CODE_KINDS)[number];

export interface UnlockCode {
  id: string;
  code: string;
  kind: UnlockCodeKind;
  /** Who it was given to (ambassador name, partner institution). Free text for staff. */
  label: string;
  /** Null = unlimited. */
  maxUses: number | null;
  usedCount: number;
  expiresAt?: Date | undefined;
  status: "active" | "disabled";
  /** Empty = unlocks every gated course; otherwise only these courses. */
  courseIds: string[];
  createdBy?: string | undefined;
  createdAt: Date;
}

export type RedeemOutcome = "ok" | "already" | "exhausted" | "expired" | "inactive";

export interface UnlockCodeRepository {
  create(
    input: Omit<UnlockCode, "id" | "usedCount" | "createdAt"> & { now: Date },
  ): Promise<UnlockCode>;
  findByCode(code: string): Promise<UnlockCode | null>;
  findById(id: string): Promise<UnlockCode | null>;
  list(query: {
    page: number;
    pageSize: number;
    q?: string | undefined;
  }): Promise<Page<UnlockCode>>;
  update(
    id: string,
    patch: Partial<Pick<UnlockCode, "label" | "maxUses" | "expiresAt" | "status">>,
  ): Promise<void>;
  /** Atomic: counts the use only while the cap, expiry and status allow it. One redemption per user per code. */
  redeem(codeId: string, userId: string, now: Date): Promise<RedeemOutcome>;
  listRedemptions(codeId: string): Promise<{ userId: string; at: Date }[]>;
}
