import type { Page, PageRequest } from "../../core/page.js";
import type {
  Application,
  ApplicationEvent,
  ApplicationStatus,
  Department,
  Placement,
  PlacementStatus,
  Posting,
  PostingStatus,
  ReviewNote,
  SupervisorFeedback,
} from "./internships.types.js";

export type NewPosting = Omit<Posting, "id" | "createdAt" | "updatedAt">;
export type PostingPatch = Partial<
  Omit<Posting, "id" | "slug" | "createdAt" | "updatedAt" | "createdBy">
>;

export interface PostingListQuery extends PageRequest {
  status?: PostingStatus | undefined;
  department?: Department | undefined;
  q?: string | undefined;
}

export interface PostingRepository {
  create(posting: NewPosting): Promise<Posting>;
  findById(id: string): Promise<Posting | null>;
  findBySlug(slug: string): Promise<Posting | null>;
  slugExists(slug: string): Promise<boolean>;
  update(id: string, patch: PostingPatch, now: Date): Promise<Posting | null>;
  list(query: PostingListQuery): Promise<Page<Posting>>;
  /** Published postings, newest first. The service filters by open dates. */
  listPublished(): Promise<Posting[]>;
  countByStatus(): Promise<Record<PostingStatus, number>>;
}

export type NewApplication = Omit<
  Application,
  "id" | "createdAt" | "updatedAt" | "notes" | "events"
> & { events: ApplicationEvent[] };

export interface ApplicationListQuery extends PageRequest {
  postingId?: string | undefined;
  status?: ApplicationStatus | undefined;
  userId?: string | undefined;
}

export interface ApplicationPatch {
  messageToApplicant?: string | undefined;
  agreementAcceptedAt?: Date;
  agreementVersion?: string;
  guardianVerified?: { at: Date; by: string };
}

export interface ApplicationRepository {
  /** Throws "DUPLICATE" when the person already applied to this posting. */
  create(application: NewApplication): Promise<Application>;
  findById(id: string): Promise<Application | null>;
  findByPostingAndUser(postingId: string, userId: string): Promise<Application | null>;
  listByUser(userId: string): Promise<Application[]>;
  list(query: ApplicationListQuery): Promise<Page<Application>>;
  /**
   * Compare-and-set: moves the status only if it is still `from`, and appends the event in the same
   * write. Returns null when someone else changed it first, so a double click or two reviewers can
   * never apply the same move twice.
   */
  transition(
    id: string,
    from: ApplicationStatus,
    event: ApplicationEvent,
    patch?: ApplicationPatch,
  ): Promise<Application | null>;
  /** Updates fields without moving the status (for example after the guardian is verified). */
  patch(id: string, patch: ApplicationPatch, now: Date): Promise<Application | null>;
  addNote(id: string, note: ReviewNote, now: Date): Promise<Application | null>;
  countByStatus(postingId?: string): Promise<Record<ApplicationStatus, number>>;
}

export type NewPlacement = Omit<
  Placement,
  "id" | "createdAt" | "updatedAt" | "feedback" | "endedAt" | "outcomeSummary"
>;

export interface PlacementListQuery extends PageRequest {
  status?: PlacementStatus | undefined;
  postingId?: string | undefined;
  supervisorId?: string | undefined;
}

export interface PlacementRepository {
  /** Throws "DUPLICATE" when the application already has a placement. */
  create(placement: NewPlacement): Promise<Placement>;
  findById(id: string): Promise<Placement | null>;
  findByApplication(applicationId: string): Promise<Placement | null>;
  listByUser(userId: string): Promise<Placement[]>;
  listBySupervisor(supervisorId: string): Promise<Placement[]>;
  list(query: PlacementListQuery): Promise<Page<Placement>>;
  /** Placements currently running for one supervisor (their load). */
  countActiveBySupervisor(supervisorId: string): Promise<number>;
  countActiveByPosting(postingId: string): Promise<number>;
  activeLoadBySupervisor(): Promise<Record<string, number>>;
  setSupervisor(id: string, supervisorId: string, now: Date): Promise<Placement | null>;
  /** Only an active placement can end. Returns null if it already ended. */
  end(
    id: string,
    status: Exclude<PlacementStatus, "active">,
    summary: string | undefined,
    at: Date,
  ): Promise<Placement | null>;
  addFeedback(id: string, feedback: SupervisorFeedback, now: Date): Promise<Placement | null>;
}
