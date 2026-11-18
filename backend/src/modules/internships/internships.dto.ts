import type { User } from "../users/users.types.js";
import { AGREEMENT_VERSION } from "./internships.types.js";
import { canMove, canWithdraw } from "./internships.rules.js";
import type { Application, Placement, Posting } from "./internships.types.js";

/**
 * Explicit allow-lists, one per audience. A field that is not named here is never sent, so adding a
 * column to the database cannot leak it by accident.
 */

const iso = (d: Date | undefined): string | undefined => d?.toISOString();

/** What anyone on the internet may see. No supervisors, no creator, no internal ids beyond the posting's own. */
export function publicPostingDto(p: Posting) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    department: p.department,
    summary: p.summary,
    description: p.description,
    requirements: p.requirements,
    learningGoals: p.learningGoals,
    mode: p.mode,
    location: p.location,
    durationWeeks: p.durationWeeks,
    hoursPerWeek: p.hoursPerWeek,
    compensation: p.compensation,
    compensationNote: p.compensationNote,
    minAge: p.minAge,
    slots: p.slots,
    opensAt: iso(p.opensAt),
    closesAt: iso(p.closesAt),
    /** The programme promise, shown next to every posting. */
    notice:
      "Applying does not guarantee a place. We accept interns only when there is a suitable project and a supervisor.",
  };
}

export function adminPostingDto(p: Posting, supervisorNames: Record<string, string> = {}) {
  return {
    ...publicPostingDto(p),
    status: p.status,
    supervisorIds: p.supervisorIds,
    supervisors: p.supervisorIds.map((id) => ({ id, name: supervisorNames[id] ?? "Unknown" })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: iso(p.publishedAt),
  };
}

/** What the applicant sees about their own application: never reviewer notes, scores or staff ids. */
export function applicantApplicationDto(a: Application, posting: Posting | null) {
  return {
    id: a.id,
    posting:
      posting === null
        ? null
        : {
            id: posting.id,
            slug: posting.slug,
            title: posting.title,
            department: posting.department,
          },
    status: a.status,
    statement: a.statement,
    links: a.links,
    availableFrom: iso(a.availableFrom),
    under18: a.under18,
    guardian:
      a.guardian === undefined
        ? undefined
        : {
            name: a.guardian.name,
            relationship: a.guardian.relationship,
            verified: a.guardian.verifiedAt !== undefined,
          },
    messageToApplicant: a.messageToApplicant,
    timeline: a.events.map((e) => ({ at: e.at.toISOString(), status: e.to })),
    agreementAcceptedAt: iso(a.agreementAcceptedAt),
    canWithdraw: canWithdraw(a.status),
    canAccept: canMove(a.status, "accepted", "applicant"),
    /** The agreement version the applicant must accept now. */
    agreementVersion: AGREEMENT_VERSION,
    createdAt: a.createdAt.toISOString(),
  };
}

export function applicantPlacementDto(
  p: Placement,
  posting: Posting | null,
  supervisor: User | null,
) {
  return {
    id: p.id,
    posting: posting === null ? null : { slug: posting.slug, title: posting.title },
    supervisor: supervisor === null ? null : { name: supervisor.displayName },
    startsOn: p.startsOn.toISOString(),
    endsOn: p.endsOn.toISOString(),
    status: p.status,
    outcomeSummary: p.outcomeSummary,
    // Only the feedback the supervisor chose to share.
    feedback: p.feedback
      .filter((f) => f.visibleToIntern)
      .map((f) => ({ at: f.at.toISOString(), text: f.text, rating: f.rating })),
  };
}

/** Staff view: everything, including notes and the applicant's contact details. */
export function adminApplicationDto(
  a: Application,
  applicant: User | null,
  posting: Posting | null,
) {
  return {
    id: a.id,
    postingId: a.postingId,
    postingTitle: posting?.title,
    applicant:
      applicant === null
        ? null
        : {
            id: applicant.id,
            displayName: applicant.displayName,
            email: applicant.email,
            phone: applicant.phone,
          },
    status: a.status,
    statement: a.statement,
    links: a.links,
    availableFrom: iso(a.availableFrom),
    under18: a.under18,
    guardian:
      a.guardian === undefined
        ? undefined
        : {
            name: a.guardian.name,
            relationship: a.guardian.relationship,
            contact: a.guardian.contact,
            verifiedAt: iso(a.guardian.verifiedAt),
          },
    messageToApplicant: a.messageToApplicant,
    notes: a.notes.map((n) => ({ at: n.at.toISOString(), by: n.by, text: n.text, score: n.score })),
    averageScore:
      a.notes.filter((n) => n.score !== undefined).length === 0
        ? undefined
        : Math.round(
            (a.notes.reduce((sum, n) => sum + (n.score ?? 0), 0) /
              a.notes.filter((n) => n.score !== undefined).length) *
              10,
          ) / 10,
    timeline: a.events.map((e) => ({ at: e.at.toISOString(), by: e.by, from: e.from, to: e.to })),
    agreementAcceptedAt: iso(a.agreementAcceptedAt),
    agreementVersion: a.agreementVersion,
    consentNoticeVersion: a.consentNoticeVersion,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function adminPlacementDto(
  p: Placement,
  parts: { posting?: Posting | null; intern?: User | null; supervisor?: User | null } = {},
) {
  return {
    id: p.id,
    applicationId: p.applicationId,
    postingId: p.postingId,
    postingTitle: parts.posting?.title,
    intern: parts.intern
      ? { id: parts.intern.id, displayName: parts.intern.displayName, email: parts.intern.email }
      : null,
    supervisor: parts.supervisor
      ? { id: parts.supervisor.id, displayName: parts.supervisor.displayName }
      : { id: p.supervisorId, displayName: "Unknown" },
    startsOn: p.startsOn.toISOString(),
    endsOn: p.endsOn.toISOString(),
    status: p.status,
    agreementVersion: p.agreementVersion,
    agreementAcceptedAt: p.agreementAcceptedAt.toISOString(),
    feedback: p.feedback.map((f) => ({
      at: f.at.toISOString(),
      by: f.by,
      text: f.text,
      rating: f.rating,
      visibleToIntern: f.visibleToIntern,
    })),
    outcomeSummary: p.outcomeSummary,
    endedAt: iso(p.endedAt),
    createdAt: p.createdAt.toISOString(),
  };
}

/** What a supervisor sees of an intern: name and contact for their own placements only. */
export function supervisorPlacementDto(p: Placement, posting: Posting | null, intern: User | null) {
  return {
    id: p.id,
    postingTitle: posting?.title,
    intern: intern === null ? null : { displayName: intern.displayName, email: intern.email },
    startsOn: p.startsOn.toISOString(),
    endsOn: p.endsOn.toISOString(),
    status: p.status,
    feedback: p.feedback
      .filter((f) => f.by === p.supervisorId)
      .map((f) => ({
        at: f.at.toISOString(),
        text: f.text,
        rating: f.rating,
        visibleToIntern: f.visibleToIntern,
      })),
  };
}
