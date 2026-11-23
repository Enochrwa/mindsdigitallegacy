import type { User } from "../users/users.types.js";
import type {
  Application,
  ApplicationStatus,
  InterviewDetails,
  Posting,
  ScreeningAnswer,
  ScreeningQuestion,
} from "./internships.types.js";

/**
 * The pure rules of the programme: no database, no clock of its own. Everything the service decides
 * goes through here so it can be tested exhaustively.
 */

export type Actor = "staff" | "applicant" | "system";

/** Every legal move. A pair missing from this table can never happen, whoever asks. */
const MOVES: readonly { from: ApplicationStatus; to: ApplicationStatus; by: readonly Actor[] }[] = [
  { from: "submitted", to: "shortlisted", by: ["staff"] },
  { from: "submitted", to: "rejected", by: ["staff"] },
  { from: "submitted", to: "withdrawn", by: ["applicant"] },
  { from: "shortlisted", to: "interview", by: ["staff"] },
  { from: "shortlisted", to: "offered", by: ["staff"] },
  { from: "shortlisted", to: "rejected", by: ["staff"] },
  { from: "shortlisted", to: "withdrawn", by: ["applicant"] },
  { from: "interview", to: "offered", by: ["staff"] },
  { from: "interview", to: "rejected", by: ["staff"] },
  { from: "interview", to: "withdrawn", by: ["applicant"] },
  { from: "offered", to: "accepted", by: ["applicant"] },
  { from: "offered", to: "rejected", by: ["staff"] }, // offer withdrawn by us
  { from: "offered", to: "withdrawn", by: ["applicant"] }, // offer declined
  { from: "accepted", to: "placed", by: ["system"] },
  { from: "accepted", to: "rejected", by: ["staff"] }, // before a placement exists
  { from: "accepted", to: "withdrawn", by: ["applicant"] },
];

export function canMove(from: ApplicationStatus, to: ApplicationStatus, by: Actor): boolean {
  return MOVES.some((m) => m.from === from && m.to === to && m.by.includes(by));
}

/** Statuses staff may choose in the review screen (placing is a separate, guarded action). */
export const STAFF_TARGETS: readonly ApplicationStatus[] = [
  "shortlisted",
  "interview",
  "offered",
  "rejected",
];

export const isTerminal = (s: ApplicationStatus): boolean =>
  s === "rejected" || s === "withdrawn" || s === "placed";

/** The statuses from which an applicant may still pull out. */
export const canWithdraw = (s: ApplicationStatus): boolean => canMove(s, "withdrawn", "applicant");

export function isOpenForApplications(p: Posting, now: Date): boolean {
  if (p.status !== "published") return false;
  if (p.opensAt !== undefined && p.opensAt.getTime() > now.getTime()) return false;
  if (p.closesAt !== undefined && p.closesAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Slots a posting can honestly offer: supervisors available times how many interns each may guide. */
export const maxSlots = (supervisors: number, perSupervisor: number): number =>
  supervisors * perSupervisor;

export type EligibilityProblem =
  | "NOT_ACTIVE"
  | "TOO_YOUNG"
  | "POSTING_CLOSED"
  | "GUARDIAN_REQUIRED"
  | "GUARDIAN_NOT_ALLOWED"
  | "TOO_MANY_OPEN";

/**
 * Who may apply. Under-16 learners never can (their account itself needs guardian consent). A posting
 * for 18+ needs an adult applicant. Someone under 18 must name a guardian; an adult must not be asked to.
 */
export function checkEligibility(
  user: Pick<User, "ageBracket" | "emailVerifiedAt" | "deletedAt" | "suspendedAt" | "guardian">,
  posting: Posting,
  input: { under18: boolean; hasGuardian: boolean; openCount?: number; maxOpen?: number },
  now: Date,
): EligibilityProblem | null {
  if (
    user.deletedAt !== undefined ||
    user.suspendedAt !== undefined ||
    user.emailVerifiedAt === undefined
  ) {
    return "NOT_ACTIVE";
  }
  if (user.ageBracket === "under_16") return "TOO_YOUNG";
  if (!isOpenForApplications(posting, now)) return "POSTING_CLOSED";
  if (posting.minAge === 18 && input.under18) return "TOO_YOUNG";
  if (input.maxOpen !== undefined && (input.openCount ?? 0) >= input.maxOpen)
    return "TOO_MANY_OPEN";
  if (input.under18 && !input.hasGuardian) return "GUARDIAN_REQUIRED";
  if (!input.under18 && input.hasGuardian) return "GUARDIAN_NOT_ALLOWED";
  return null;
}

export type PlacementProblem =
  | "NOT_ACCEPTED"
  | "NO_AGREEMENT"
  | "GUARDIAN_NOT_VERIFIED"
  | "SUPERVISOR_NOT_ON_POSTING"
  | "SUPERVISOR_FULL"
  | "NO_SLOTS"
  | "BAD_DATES";

/** The checks before any intern is placed. Returns the first problem, or null when placement is allowed. */
export function checkPlacement(input: {
  application: Pick<Application, "status" | "agreementAcceptedAt" | "under18" | "guardian">;
  posting: Pick<Posting, "slots" | "supervisorIds">;
  supervisorId: string;
  supervisorActive: number;
  activeOnPosting: number;
  perSupervisor: number;
  startsOn: Date;
  endsOn: Date;
}): PlacementProblem | null {
  const { application: a, posting: p } = input;
  if (a.status !== "accepted") return "NOT_ACCEPTED";
  if (a.agreementAcceptedAt === undefined) return "NO_AGREEMENT";
  if (a.under18 && a.guardian?.verifiedAt === undefined) return "GUARDIAN_NOT_VERIFIED";
  if (!p.supervisorIds.includes(input.supervisorId)) return "SUPERVISOR_NOT_ON_POSTING";
  if (input.supervisorActive >= input.perSupervisor) return "SUPERVISOR_FULL";
  if (input.activeOnPosting >= p.slots) return "NO_SLOTS";
  if (input.endsOn.getTime() <= input.startsOn.getTime()) return "BAD_DATES";
  return null;
}

/** The only links an application may carry: absolute https URLs, no credentials, no scripts. */
export function cleanLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    return url.toString().slice(0, 300);
  } catch {
    return null;
  }
}

const SLUG = /[^a-z0-9]+/g;
export const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(SLUG, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Slugs that would collide with fixed routes. */
export const RESERVED_SLUGS = new Set([
  "applications",
  "placements",
  "me",
  "saved",
  "profile",
  "alerts",
]);

// ------------------------------------------------------------ screening answers

export type AnswerProblem =
  | { code: "UNKNOWN_QUESTION"; questionId: string }
  | { code: "DUPLICATE_ANSWER"; questionId: string }
  | { code: "MISSING_ANSWER"; questionId: string }
  | { code: "BAD_ANSWER"; questionId: string };

/**
 * Checks what an applicant answered against the posting's questions, and returns the cleaned answers.
 * Only the posting's own questions are accepted, once each; required ones must be answered; a yes/no
 * answer must be "yes" or "no"; a choice must be one of the options; text is trimmed and at most 500 characters.
 */
export function validateAnswers(
  questions: readonly ScreeningQuestion[],
  given: readonly ScreeningAnswer[],
): { ok: true; answers: ScreeningAnswer[] } | { ok: false; problem: AnswerProblem } {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const clean: ScreeningAnswer[] = [];
  for (const a of given) {
    const q = byId.get(a.questionId);
    if (q === undefined)
      return { ok: false, problem: { code: "UNKNOWN_QUESTION", questionId: a.questionId } };
    if (seen.has(q.id))
      return { ok: false, problem: { code: "DUPLICATE_ANSWER", questionId: q.id } };
    seen.add(q.id);
    const text = a.answer.trim();
    if (text === "") continue; // an empty answer counts as not answered
    const valid =
      q.kind === "text"
        ? text.length <= 500
        : q.kind === "yes_no"
          ? text === "yes" || text === "no"
          : (q.options ?? []).includes(text);
    if (!valid) return { ok: false, problem: { code: "BAD_ANSWER", questionId: q.id } };
    clean.push({ questionId: q.id, answer: text });
  }
  for (const q of questions) {
    if (q.required && !clean.some((a) => a.questionId === q.id)) {
      return { ok: false, problem: { code: "MISSING_ANSWER", questionId: q.id } };
    }
  }
  return { ok: true, answers: clean };
}

// -------------------------------------------------------------------- interview

/** An interview must be in the future and its place must fit its kind (an https link when online). */
export function interviewProblem(
  i: InterviewDetails,
  now: Date,
): "PAST" | "BAD_LINK" | "EMPTY_PLACE" | null {
  if (i.at.getTime() <= now.getTime()) return "PAST";
  if (i.where.trim() === "") return "EMPTY_PLACE";
  if (i.mode === "online" && cleanLink(i.where) === null) return "BAD_LINK";
  return null;
}
