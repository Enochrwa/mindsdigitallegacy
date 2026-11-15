import type { Page, PageRequest } from "../../core/page.js";
import type {
  Referral,
  ReferralCode,
  ReferralEvent,
  ReferralEventType,
  ReferralStatus,
  RejectReason,
} from "./referrals.types.js";

export interface ReferralListQuery extends PageRequest {
  status?: ReferralStatus | undefined;
  reason?: RejectReason | undefined;
  referrerId?: string | undefined;
}

export interface FunnelCounts {
  byType: Partial<Record<ReferralEventType, number>>;
  /** Same counts split by the referrer's assigned threshold (key "default" when none). */
  byVariant: Record<string, Partial<Record<ReferralEventType, number>>>;
}

export interface ReferralRepository {
  findCodeByUser(userId: string): Promise<ReferralCode | null>;
  findCode(code: string): Promise<ReferralCode | null>;
  /** Idempotent per user: returns the existing code when one exists. Throws "CODE_TAKEN" on a code collision. */
  createCode(input: {
    userId: string;
    code: string;
    assignedThreshold?: number | undefined;
    now: Date;
  }): Promise<ReferralCode>;
  setCodeStatus(codeId: string, status: "active" | "disabled"): Promise<void>;
  listCodes(query: PageRequest & { q?: string | undefined }): Promise<Page<ReferralCode>>;

  findByInvitee(inviteeId: string): Promise<Referral | null>;
  findById(id: string): Promise<Referral | null>;
  /** Unique per invitee: returns the existing row if the invitee was already attributed. */
  create(input: Omit<Referral, "id">): Promise<Referral>;
  update(
    id: string,
    patch: Partial<
      Pick<Referral, "status" | "reason" | "qualifiedAt" | "reviewedAt" | "reviewedBy">
    >,
  ): Promise<void>;
  list(query: ReferralListQuery): Promise<Page<Referral>>;
  countByStatus(referrerId: string): Promise<Record<ReferralStatus, number>>;
  countQualifiedFromNetwork(referrerId: string, ipPrefix: string): Promise<number>;
  countCreatedSince(code: string, since: Date): Promise<number>;
  existsOtherWithEmailKey(emailKey: string, exceptInviteeId: string): Promise<boolean>;

  appendEvent(event: ReferralEvent): Promise<void>;
  funnel(since: Date): Promise<FunnelCounts>;
  eventsByDay(since: Date, type: ReferralEventType): Promise<{ day: string; count: number }[]>;
}
