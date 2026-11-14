/**
 * Referral model (ADR-0002). Three kinds of rows:
 *  - ReferralCode: one per user, the thing in the link.
 *  - Referral: one per invited person (unique), with a status that only moves forward through reviewed steps.
 *  - ReferralEvent: append-only funnel log, used for analytics and for explaining what happened.
 */
export const REFERRAL_STATUSES = [
  "pending",
  "qualified",
  "needs_review",
  "rejected",
  "revoked",
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** Why a referral did not count. Visible to staff only, never to the referrer or the invitee. */
export const REJECT_REASONS = [
  "self_referral",
  "disposable_email",
  "duplicate_contact",
  "network_cap",
  "velocity",
  "referrer_inactive",
  "invitee_inactive",
  "staff_rejected",
  "fraud_revoked",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export interface ReferralCode {
  id: string;
  userId: string;
  /** Public, unguessable, upper-case, no look-alike characters. */
  code: string;
  status: "active" | "disabled";
  /** Threshold this referrer was assigned if an experiment was running when the code was made. */
  assignedThreshold?: number | undefined;
  createdAt: Date;
}

export interface Referral {
  id: string;
  referrerId: string;
  inviteeId: string;
  code: string;
  status: ReferralStatus;
  reason?: RejectReason | undefined;
  /** Network the invitee registered from (/24), used for the per-network cap. */
  ipPrefix: string;
  /** Hash of the invitee email with plus-tags and Gmail dots removed, to spot one person with many addresses. */
  emailKey: string;
  createdAt: Date;
  qualifiedAt?: Date | undefined;
  reviewedAt?: Date | undefined;
  reviewedBy?: string | undefined;
}

export const REFERRAL_EVENT_TYPES = [
  "visit",
  "attributed",
  "qualified",
  "needs_review",
  "rejected",
  "approved",
  "revoked",
  "unlocked",
] as const;
export type ReferralEventType = (typeof REFERRAL_EVENT_TYPES)[number];

export interface ReferralEvent {
  at: Date;
  type: ReferralEventType;
  code?: string | undefined;
  referrerId?: string | undefined;
  inviteeId?: string | undefined;
  reason?: RejectReason | undefined;
  /** The threshold variant of the referrer, so an experiment can be compared. */
  variant?: number | undefined;
}
