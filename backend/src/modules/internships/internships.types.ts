/**
 * Internship programme (Sprint 4). Proposal section 4.3 sets the rules this module enforces in code:
 *  - an application never guarantees a placement;
 *  - no placement without a named supervisor with spare capacity;
 *  - age-related safeguards: under-18 applicants need a guardian approval before they can be placed;
 *  - reviewer notes and scores are for staff only and never reach the applicant.
 */

export const DEPARTMENTS = [
  "software_web",
  "mobile",
  "it_support",
  "cyber_awareness",
  "data_bi",
  "design",
  "marketing_content",
  "business_admin",
  "project_ops",
  "research_education",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** Pay terms are a founder decision (sprint plan F6). The posting states them plainly; nothing is implied. */
export const COMPENSATION = ["unpaid", "stipend", "paid"] as const;
export type Compensation = (typeof COMPENSATION)[number];

export const POSTING_STATUSES = ["draft", "published", "closed"] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "submitted",
  "shortlisted",
  "interview",
  "offered",
  "accepted",
  "placed",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const PLACEMENT_STATUSES = ["active", "completed", "ended_early", "cancelled"] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

/** Version of the intern agreement text the applicant accepts. Bump it when the lawyer-approved text changes. */
export const AGREEMENT_VERSION = "2026-11-draft";

/** One question an applicant answers when applying (like Internshala's assessment or LinkedIn's screening questions). */
export interface ScreeningQuestion {
  /** Short stable key: letters, digits and underscore. Answers refer to it. */
  id: string;
  label: string;
  kind: "text" | "yes_no" | "choice";
  required: boolean;
  /** For `choice`: 2 to 6 options. */
  options?: string[] | undefined;
}

export interface ScreeningAnswer {
  questionId: string;
  answer: string;
}

export const EDUCATION_LEVELS = ["secondary", "tvet", "university", "graduate", "other"] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/** What a reviewer sees of the applicant's saved profile, frozen at the moment of applying. */
export interface ProfileSnapshot {
  headline: string;
  educationLevel: EducationLevel;
  institution: string;
  field: string;
  skills: string[];
  about: string;
}

export const INTERVIEW_MODES = ["onsite", "online", "phone"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

/** Shown to the applicant (and offered as a calendar file) when staff invite them to interview. */
export interface InterviewDetails {
  at: Date;
  mode: InterviewMode;
  /** An address for `onsite`, an https link for `online`, a number to call for `phone`. */
  where: string;
  note?: string | undefined;
}

export interface Posting {
  id: string;
  slug: string;
  title: string;
  department: Department;
  summary: string;
  description: string;
  requirements: string[];
  learningGoals: string[];
  mode: WorkMode;
  location: string;
  durationWeeks: number;
  hoursPerWeek: number;
  compensation: Compensation;
  compensationNote: string;
  /** Applicants must be at least this old (16 or 18). Under-16 learners can never apply. */
  minAge: 16 | 18;
  slots: number;
  /** Skills that help for this role. Shown as tags and compared with the applicant's saved skills. */
  skills: string[];
  /** What the intern does day to day. */
  responsibilities: string[];
  /** Extra eligibility lines shown under "Who can apply". */
  whoCanApply: string[];
  /** What the intern gets besides the work (certificate, reference letter, mentoring...). */
  perks: string[];
  /** Earliest start date, if fixed. */
  startsOn?: Date | undefined;
  screeningQuestions: ScreeningQuestion[];
  /** Named supervisors for this posting. Slots can never exceed supervisors x the per-supervisor limit. */
  supervisorIds: string[];
  status: PostingStatus;
  opensAt?: Date | undefined;
  closesAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date | undefined;
}

export interface ApplicationEvent {
  at: Date;
  /** User id of the person (applicant or staff) or "system". */
  by: string;
  from: ApplicationStatus | null;
  to: ApplicationStatus;
}

/** Staff-only. Never serialised to the applicant. */
export interface ReviewNote {
  at: Date;
  by: string;
  text: string;
  /** 1 to 5, optional. */
  score?: number | undefined;
}

export interface GuardianApproval {
  name: string;
  relationship: string;
  contact: string;
  /** Set by staff after they have spoken to the guardian. Required before an under-18 can be placed. */
  verifiedAt?: Date | undefined;
  verifiedBy?: string | undefined;
}

export interface Application {
  id: string;
  postingId: string;
  userId: string;
  statement: string;
  links: string[];
  availableFrom?: Date | undefined;
  under18: boolean;
  guardian?: GuardianApproval | undefined;
  status: ApplicationStatus;
  events: ApplicationEvent[];
  notes: ReviewNote[];
  /** A short message staff chose to share with the applicant (for example, why a place was not offered). */
  messageToApplicant?: string | undefined;
  consentNoticeVersion: string;
  consentAt: Date;
  answers: ScreeningAnswer[];
  /** The applicant's saved profile as it was when they applied. Absent when they applied without one. */
  profile?: ProfileSnapshot | undefined;
  /** 0 to 100: how many of the posting's skills the applicant lists. Used to sort for reviewers. */
  matchPercent?: number | undefined;
  interview?: InterviewDetails | undefined;
  agreementAcceptedAt?: Date | undefined;
  agreementVersion?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupervisorFeedback {
  at: Date;
  by: string;
  text: string;
  rating?: number | undefined;
  /** Whether the intern can read it. Defaults to true; supervisors can keep a note private to staff. */
  visibleToIntern: boolean;
}

export interface Placement {
  id: string;
  applicationId: string;
  postingId: string;
  userId: string;
  supervisorId: string;
  startsOn: Date;
  endsOn: Date;
  status: PlacementStatus;
  agreementVersion: string;
  agreementAcceptedAt: Date;
  feedback: SupervisorFeedback[];
  /** Short wrap-up written by staff when a placement ends. */
  outcomeSummary?: string | undefined;
  endedAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
