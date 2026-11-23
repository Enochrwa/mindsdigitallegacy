import type { Department, EducationLevel, ScreeningAnswer, WorkMode } from "./internships.types.js";

/**
 * The applicant's reusable details ("apply once, reuse everywhere", like LinkedIn's saved application data).
 * It is theirs: they can edit or delete it any time, it is in their data export, and it is removed with
 * their account. A reviewer only sees a frozen copy of the parts below at the moment of applying.
 */
export interface InternshipProfile {
  userId: string;
  headline: string;
  educationLevel: EducationLevel;
  institution: string;
  field: string;
  graduationYear?: number | undefined;
  skills: string[];
  /** https links to a portfolio, GitHub, LinkedIn or a CV hosted anywhere. */
  links: string[];
  /** A reusable introduction that prefills the application's personal note. */
  about: string;
  availableFrom?: Date | undefined;
  hoursPerWeek?: number | undefined;
  updatedAt: Date;
}

export interface InternshipDraft {
  userId: string;
  postingId: string;
  statement: string;
  links: string[];
  answers: ScreeningAnswer[];
  availableFrom?: Date | undefined;
  updatedAt: Date;
  /** Set once we have mailed a "finish your application" reminder. */
  remindedAt?: Date | undefined;
}

export interface InternshipSave {
  userId: string;
  postingId: string;
  createdAt: Date;
  remindedAt?: Date | undefined;
}

export interface InternshipAlert {
  userId: string;
  /** Empty means any department. */
  departments: Department[];
  /** Empty means any way of working. */
  modes: WorkMode[];
  /** Optional words that must appear in the title, summary or skills. */
  keywords: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileRepository {
  get(userId: string): Promise<InternshipProfile | null>;
  upsert(profile: InternshipProfile): Promise<InternshipProfile>;
  remove(userId: string): Promise<boolean>;
}

export interface DraftRepository {
  get(userId: string, postingId: string): Promise<InternshipDraft | null>;
  upsert(draft: Omit<InternshipDraft, "remindedAt">): Promise<InternshipDraft>;
  remove(userId: string, postingId: string): Promise<boolean>;
  listByUser(userId: string): Promise<InternshipDraft[]>;
  /** Drafts for these postings that have not been reminded yet. */
  listForReminder(postingIds: string[]): Promise<InternshipDraft[]>;
  markReminded(userId: string, postingId: string, at: Date): Promise<void>;
}

export interface SaveRepository {
  /** Idempotent. Returns false when it was already saved. */
  add(userId: string, postingId: string, now: Date): Promise<boolean>;
  remove(userId: string, postingId: string): Promise<boolean>;
  listByUser(userId: string): Promise<InternshipSave[]>;
  has(userId: string, postingId: string): Promise<boolean>;
  listForReminder(postingIds: string[]): Promise<InternshipSave[]>;
  markReminded(userId: string, postingId: string, at: Date): Promise<void>;
}

export interface AlertRepository {
  get(userId: string): Promise<InternshipAlert | null>;
  upsert(alert: InternshipAlert): Promise<InternshipAlert>;
  remove(userId: string): Promise<boolean>;
  listActive(limit: number): Promise<InternshipAlert[]>;
}

/** Everything the "easier applying" features store about one person. Deleted together on account purge. */
export interface ExtrasRepositories {
  profiles: ProfileRepository;
  drafts: DraftRepository;
  saves: SaveRepository;
  alerts: AlertRepository;
  removeAllForUser(userId: string): Promise<Record<string, number>>;
}
