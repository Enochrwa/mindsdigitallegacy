/**
 * Internship programme client (Sprint 4). Types mirror backend/src/modules/internships/*.dto.ts.
 * The server decides who may do what; the helpers here only decide how things are worded and which
 * buttons are worth showing. Nothing in this file is a permission check.
 */
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";

// ------------------------------------------------------------------ vocabulary

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

export const DEPARTMENT_LABEL: Record<Department, string> = {
  software_web: "Software and web development",
  mobile: "Mobile application development",
  it_support: "IT support and networking",
  cyber_awareness: "Cybersecurity awareness and defensive IT",
  data_bi: "Data analysis and business intelligence",
  design: "UI/UX and graphic design",
  marketing_content: "Digital marketing and content",
  business_admin: "Business administration and customer relations",
  project_ops: "Project management and operations",
  research_education: "Research, innovation and digital education",
};

export const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
export const COMPENSATION = ["unpaid", "stipend", "paid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export type Compensation = (typeof COMPENSATION)[number];

export const MODE_LABEL: Record<WorkMode, string> = {
  onsite: "On site",
  remote: "Remote",
  hybrid: "Hybrid",
};
export const COMPENSATION_LABEL: Record<Compensation, string> = {
  unpaid: "Unpaid (learning placement)",
  stipend: "Stipend",
  paid: "Paid",
};

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

/** Plain words for the applicant. Never implies a place until it is really confirmed. */
export const APPLICANT_STATUS_TEXT: Record<ApplicationStatus, { label: string; help: string }> = {
  submitted: {
    label: "Received",
    help: "We have your application. Our team will review it.",
  },
  shortlisted: {
    label: "Shortlisted",
    help: "You have moved to the next stage. We will be in touch.",
  },
  interview: {
    label: "Interview stage",
    help: "We would like to talk to you. We will contact you about the time.",
  },
  offered: {
    label: "Offer made",
    help: "We have offered you a place. Read the agreement and accept or decline below.",
  },
  accepted: {
    label: "Offer accepted",
    help: "Thank you. Your placement is not confirmed until a supervisor and dates are set. We will email you.",
  },
  placed: {
    label: "Placement confirmed",
    help: "Your internship is set up. See the details under Your placements.",
  },
  rejected: {
    label: "Not selected",
    help: "We could not offer you a place this time. You are welcome to apply again.",
  },
  withdrawn: { label: "Withdrawn", help: "You withdrew this application." },
};

/** What staff may do next from each status. Mirrors the server table; the server has the final say. */
export const STAFF_NEXT: Record<
  ApplicationStatus,
  readonly ("shortlisted" | "interview" | "offered" | "rejected")[]
> = {
  submitted: ["shortlisted", "rejected"],
  shortlisted: ["interview", "offered", "rejected"],
  interview: ["offered", "rejected"],
  offered: ["rejected"],
  accepted: ["rejected"],
  placed: [],
  rejected: [],
  withdrawn: [],
};

export const STAFF_ACTION_LABEL: Record<
  "shortlisted" | "interview" | "offered" | "rejected",
  string
> = {
  shortlisted: "Shortlist",
  interview: "Move to interview",
  offered: "Make an offer",
  rejected: "Decline",
};

export const PLACEMENT_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  ended_early: "Ended early",
  cancelled: "Cancelled",
};

export const isFinal = (s: ApplicationStatus): boolean =>
  s === "rejected" || s === "withdrawn" || s === "placed";

// ------------------------------------------------------------------------ DTOs

export interface PublicPosting {
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
  minAge: 16 | 18;
  slots: number;
  opensAt?: string;
  closesAt?: string;
  notice: string;
}

export interface ApplicantApplication {
  id: string;
  posting: { id: string; slug: string; title: string; department: Department } | null;
  status: ApplicationStatus;
  statement: string;
  links: string[];
  availableFrom?: string;
  under18: boolean;
  guardian?: { name: string; relationship: string; verified: boolean };
  messageToApplicant?: string;
  timeline: { at: string; status: ApplicationStatus }[];
  agreementAcceptedAt?: string;
  canWithdraw: boolean;
  canAccept: boolean;
  agreementVersion: string;
  createdAt: string;
}

export interface ApplicantPlacement {
  id: string;
  posting: { slug: string; title: string } | null;
  supervisor: { name: string } | null;
  startsOn: string;
  endsOn: string;
  status: string;
  outcomeSummary?: string;
  feedback: { at: string; text: string; rating?: number }[];
}

export interface SupervisorPlacement {
  id: string;
  postingTitle?: string;
  intern: { displayName: string; email: string } | null;
  startsOn: string;
  endsOn: string;
  status: string;
  feedback: { at: string; text: string; rating?: number; visibleToIntern: boolean }[];
}

export interface ApplyInput {
  statement: string;
  links: string[];
  availableFrom?: string;
  under18: boolean;
  guardian?: { name: string; relationship: string; contact: string };
  consent: true;
  privacyNoticeVersion: string;
}

// ------------------------------------------------------------------------- API

export const internshipsApi = {
  list: () => request<{ items: PublicPosting[] }>("GET", "/internships"),
  get: (slug: string) =>
    request<{ posting: PublicPosting }>("GET", `/internships/${encodeURIComponent(slug)}`),
  apply: (slug: string, input: ApplyInput) =>
    request<{ application: ApplicantApplication }>(
      "POST",
      `/internships/${encodeURIComponent(slug)}/apply`,
      input,
    ),
  myApplications: () =>
    request<{ items: ApplicantApplication[] }>("GET", "/internships/applications/me"),
  withdraw: (id: string) =>
    request<{ application: ApplicantApplication }>(
      "POST",
      `/internships/applications/${encodeURIComponent(id)}/withdraw`,
      {},
    ),
  accept: (id: string, agreementVersion: string) =>
    request<{ application: ApplicantApplication }>(
      "POST",
      `/internships/applications/${encodeURIComponent(id)}/accept`,
      { agreementVersion },
    ),
  myPlacements: () => request<{ items: ApplicantPlacement[] }>("GET", "/internships/placements/me"),
  supervisorPlacements: () =>
    request<{ items: SupervisorPlacement[] }>("GET", "/supervisor/placements"),
  addFeedback: (id: string, input: { text: string; rating?: number; visibleToIntern: boolean }) =>
    request<{ placement: SupervisorPlacement | null }>(
      "POST",
      `/supervisor/placements/${encodeURIComponent(id)}/feedback`,
      input,
    ),
};

export const KEYS = {
  postings: ["internships", "postings"] as const,
  posting: (slug: string) => ["internships", "posting", slug] as const,
  mine: ["internships", "mine"] as const,
  placements: ["internships", "placements"] as const,
  supervisor: ["internships", "supervisor"] as const,
};

export function usePostings() {
  return useQuery({
    queryKey: KEYS.postings,
    enabled: typeof window !== "undefined",
    staleTime: 30_000,
    queryFn: async () => {
      const r = await internshipsApi.list();
      if (!r.ok) throw new Error(r.reason);
      return r.data.items;
    },
  });
}

export function usePosting(slug: string) {
  return useQuery({
    queryKey: KEYS.posting(slug),
    enabled: typeof window !== "undefined",
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const r = await internshipsApi.get(slug);
      if (!r.ok)
        throw new Error(r.reason === "rejected" ? `rejected:${String(r.status)}` : r.reason);
      return r.data.posting;
    },
  });
}

// --------------------------------------------------------------------- helpers

/** "8 weeks, about 20 hours a week". */
export function workload(p: Pick<PublicPosting, "durationWeeks" | "hoursPerWeek">): string {
  return `${String(p.durationWeeks)} weeks, about ${String(p.hoursPerWeek)} hours a week`;
}

/** One link per line, trimmed, blanks dropped, duplicates removed. */
export function parseLinks(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l !== ""),
    ),
  ];
}

/** First problem with a list of links, or null. Mirrors the server rule: https only, no credentials. */
export function linkProblem(links: readonly string[]): string | null {
  if (links.length > 5) return "Add at most 5 links.";
  for (const raw of links) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
        return "Links must start with https:// and contain no password.";
      }
    } catch {
      return `"${raw.slice(0, 40)}" is not a valid link.`;
    }
  }
  return null;
}

export const STATEMENT_MIN = 50;
export const STATEMENT_MAX = 2000;

export function statementProblem(text: string): string | null {
  const length = text.trim().length;
  if (length < STATEMENT_MIN) {
    return `Tell us a little more: at least ${String(STATEMENT_MIN)} characters (you have ${String(length)}).`;
  }
  if (length > STATEMENT_MAX) return `Keep it under ${String(STATEMENT_MAX)} characters.`;
  return null;
}

/** Friendly text for the refusals an application can get back. */
export function applyFailureText(code: string | undefined, reason: string): string {
  switch (code) {
    case "TOO_YOUNG":
      return "You do not meet the minimum age for this internship.";
    case "GUARDIAN_REQUIRED":
      return "Applicants under 18 must name a parent or guardian.";
    case "GUARDIAN_NOT_ALLOWED":
      return "Guardian details are only for applicants under 18.";
    case "POSTING_CLOSED":
    case "NOT_FOUND":
      return "This internship is no longer open for applications.";
    default:
      break;
  }
  if (reason === "account_not_active") return "Verify your email address before applying.";
  if (reason === "unauthenticated") return "Sign in to apply.";
  if (reason === "rate_limited") return "Too many attempts. Please wait a little and try again.";
  if (reason === "network")
    return "We could not reach the server. Check your connection and try again.";
  return "We could not submit your application. Please try again.";
}

/** Whole days left until `iso`, or null when there is no deadline. Negative means passed. */
export function daysLeft(iso: string | undefined, now = Date.now()): number | null {
  if (iso === undefined) return null;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

export function deadlineText(iso: string | undefined, now = Date.now()): string {
  const days = daysLeft(iso, now);
  if (days === null) return "Open until filled";
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${String(days)} days`;
}

export function dateText(iso: string | undefined): string {
  if (iso === undefined) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** Average of 1-5 ratings, one decimal, or null when there are none. */
export function averageRating(ratings: readonly (number | undefined)[]): number | null {
  const real = ratings.filter((r): r is number => r !== undefined);
  if (real.length === 0) return null;
  return Math.round((real.reduce((a, b) => a + b, 0) / real.length) * 10) / 10;
}

// ------------------------------------------------------------------ agreement

/**
 * DRAFT agreement summary shown before an applicant accepts. It must be replaced by the text a Rwandan
 * lawyer approves (sprint plan F5, F6). The version string must match the backend's AGREEMENT_VERSION.
 */
export const AGREEMENT_DRAFT = {
  version: "2026-11-draft",
  points: [
    "This is a supervised learning placement. It is not a job and does not promise future employment.",
    "You will have a named supervisor. Your tasks will match your level and learning goals.",
    "You agree to keep client and company information confidential, during and after the placement.",
    "Work you produce for MDL projects is handled as agreed in writing before you start (ownership terms to be confirmed).",
    "We keep your personal data only as described in our privacy notice and remove it when the retention period ends.",
    "Either side may end the placement early. We will tell you why if we do.",
    "If you are under 18, your parent or guardian must be verified by our team before the placement starts.",
  ],
} as const;

// ------------------------------------------------------------- staff (admin) DTOs

export interface AdminPosting extends PublicPosting {
  status: "draft" | "published" | "closed";
  supervisorIds: string[];
  supervisors: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface AdminApplication {
  id: string;
  postingId: string;
  postingTitle?: string;
  applicant: { id: string; displayName: string; email: string; phone?: string } | null;
  status: ApplicationStatus;
  statement: string;
  links: string[];
  availableFrom?: string;
  under18: boolean;
  guardian?: { name: string; relationship: string; contact: string; verifiedAt?: string };
  messageToApplicant?: string;
  notes: { at: string; by: string; text: string; score?: number }[];
  averageScore?: number;
  timeline: { at: string; by: string; from: ApplicationStatus | null; to: ApplicationStatus }[];
  agreementAcceptedAt?: string;
  agreementVersion?: string;
  createdAt: string;
}

export interface AdminPlacement {
  id: string;
  applicationId: string;
  postingId: string;
  postingTitle?: string;
  intern: { id: string; displayName: string; email: string } | null;
  supervisor: { id: string; displayName: string };
  startsOn: string;
  endsOn: string;
  status: "active" | "completed" | "ended_early" | "cancelled";
  feedback: { at: string; by: string; text: string; rating?: number; visibleToIntern: boolean }[];
  outcomeSummary?: string;
  endedAt?: string;
}

export interface SupervisorRow {
  id: string;
  displayName: string;
  email: string;
  active: number;
  capacity: number;
  available: number;
}

export interface InternshipStats {
  postings: Record<"draft" | "published" | "closed", number>;
  applications: Record<ApplicationStatus, number>;
  totalApplications: number;
  offerRate: number;
  activePlacements: number;
  supervisors: { id: string; name: string; active: number; capacity: number }[];
}

/** Splits a textarea into trimmed, non-empty lines (requirements, learning goals). */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/**
 * Early warnings for the posting form, mirroring the server's publish rule (supervisors x per-supervisor
 * limit). The server decides; this only saves a round trip.
 */
export function capacityHint(
  supervisors: number,
  slots: number,
  perSupervisor: number,
): string | null {
  if (supervisors === 0) return "Choose at least one supervisor before publishing.";
  const max = supervisors * perSupervisor;
  if (slots > max) {
    return `${String(supervisors)} supervisor(s) can guide at most ${String(max)} intern(s) at once. Add a supervisor or reduce the places.`;
  }
  return null;
}
