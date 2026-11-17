import { AppError, notFound } from "../../core/errors.js";
import type { Page } from "../../core/page.js";
import { ipPrefix } from "../../core/security/tokens.js";
import type { AuditAction, AuditLog, AuditMeta } from "../audit/audit.js";
import type { Mailer, InternshipMail } from "../auth/mailer.js";
import type { RequestContext } from "../auth/auth.service.js";
import type { UserRepository } from "../users/users.repository.js";
import type { User } from "../users/users.types.js";
import {
  canMove,
  canWithdraw,
  checkEligibility,
  checkPlacement,
  isOpenForApplications,
  maxSlots,
  RESERVED_SLUGS,
  slugify,
  STAFF_TARGETS,
} from "./internships.rules.js";
import type { EligibilityProblem, PlacementProblem } from "./internships.rules.js";
import type {
  ApplicationListQuery,
  ApplicationRepository,
  PlacementListQuery,
  PlacementRepository,
  PostingListQuery,
  PostingRepository,
} from "./internships.repository.js";
import { AGREEMENT_VERSION } from "./internships.types.js";
import type {
  Application,
  ApplicationStatus,
  Placement,
  PlacementStatus,
  Posting,
} from "./internships.types.js";

export interface InternshipServiceDeps {
  postings: PostingRepository;
  applications: ApplicationRepository;
  placements: PlacementRepository;
  users: UserRepository;
  audit: AuditLog;
  mailer: Mailer;
  /** How many interns one supervisor may guide at the same time (proposal: limit intern numbers). */
  perSupervisor: number;
  now?: () => Date;
}

export interface ApplyInput {
  statement: string;
  links: string[];
  availableFrom?: Date | undefined;
  under18: boolean;
  guardian?: { name: string; relationship: string; contact: string } | undefined;
  privacyNoticeVersion: string;
}

export interface PostingInput {
  title: string;
  department: Posting["department"];
  summary: string;
  description: string;
  requirements: string[];
  learningGoals: string[];
  mode: Posting["mode"];
  location: string;
  durationWeeks: number;
  hoursPerWeek: number;
  compensation: Posting["compensation"];
  compensationNote: string;
  minAge: Posting["minAge"];
  slots: number;
  supervisorIds: string[];
  opensAt?: Date | undefined;
  closesAt?: Date | undefined;
}

const ELIGIBILITY_ERRORS: Record<EligibilityProblem, AppError> = {
  NOT_ACTIVE: new AppError(403, "ACCOUNT_NOT_ACTIVE", "Verify your email address before applying."),
  TOO_YOUNG: new AppError(403, "TOO_YOUNG", "You do not meet the minimum age for this internship."),
  POSTING_CLOSED: new AppError(
    409,
    "POSTING_CLOSED",
    "This internship is not open for applications.",
  ),
  GUARDIAN_REQUIRED: new AppError(
    422,
    "GUARDIAN_REQUIRED",
    "Applicants under 18 must name a parent or guardian.",
  ),
  GUARDIAN_NOT_ALLOWED: new AppError(
    422,
    "GUARDIAN_NOT_ALLOWED",
    "Guardian details are only for applicants under 18.",
  ),
};

const PLACEMENT_ERRORS: Record<PlacementProblem, AppError> = {
  NOT_ACCEPTED: new AppError(409, "NOT_ACCEPTED", "The applicant has not accepted the offer."),
  NO_AGREEMENT: new AppError(409, "NO_AGREEMENT", "The intern agreement has not been accepted."),
  GUARDIAN_NOT_VERIFIED: new AppError(
    409,
    "GUARDIAN_NOT_VERIFIED",
    "Verify the guardian before placing an applicant under 18.",
  ),
  SUPERVISOR_NOT_ON_POSTING: new AppError(
    422,
    "SUPERVISOR_NOT_ON_POSTING",
    "That supervisor is not assigned to this posting.",
  ),
  SUPERVISOR_FULL: new AppError(
    409,
    "SUPERVISOR_FULL",
    "That supervisor is already guiding the maximum number of interns.",
  ),
  NO_SLOTS: new AppError(409, "NO_SLOTS", "All slots for this posting are filled."),
  BAD_DATES: new AppError(422, "BAD_DATES", "The end date must be after the start date."),
};

const conflict = (): AppError =>
  new AppError(
    409,
    "STATE_CHANGED",
    "This application was just changed by someone else. Reload and try again.",
  );

export function createInternshipService(deps: InternshipServiceDeps) {
  const { postings, applications, placements, users, audit, mailer, perSupervisor } = deps;
  const now = deps.now ?? ((): Date => new Date());

  async function record(
    action: AuditAction,
    actorId: string,
    ctx: RequestContext,
    meta: AuditMeta,
  ): Promise<void> {
    await audit.append({
      at: now(),
      actorId,
      action,
      requestId: ctx.requestId,
      ipPrefix: ipPrefix(ctx.ip),
      outcome: "success",
      meta,
    });
  }

  /** Mail problems never fail a request; the mailer already logs without addresses. */
  async function notify(user: User | null, title: string, kind: InternshipMail): Promise<void> {
    if (user === null) return;
    try {
      await mailer.sendInternshipUpdate(user.email, user.displayName, title, kind);
    } catch {
      /* swallowed on purpose: a mail outage must not block a review or an application */
    }
  }

  async function mustPosting(id: string): Promise<Posting> {
    const p = await postings.findById(id);
    if (p === null) throw notFound();
    return p;
  }
  async function mustApplication(id: string): Promise<Application> {
    const a = await applications.findById(id);
    if (a === null) throw notFound();
    return a;
  }

  /** Supervisors must hold the role and be in good standing. */
  async function mustSupervisors(ids: string[]): Promise<User[]> {
    const unique = [...new Set(ids)];
    const found = await Promise.all(unique.map((id) => users.findById(id)));
    const ok = found.filter(
      (u): u is User =>
        u !== null &&
        u.roles.includes("supervisor") &&
        u.deletedAt === undefined &&
        u.suspendedAt === undefined,
    );
    if (ok.length !== unique.length) {
      throw new AppError(
        422,
        "INVALID_SUPERVISOR",
        "Every supervisor must be an active account with the supervisor role.",
      );
    }
    return ok;
  }

  async function uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || "internship";
    for (let n = 1; n < 50; n += 1) {
      const candidate = n === 1 ? base : `${base}-${String(n)}`;
      if (!RESERVED_SLUGS.has(candidate) && !(await postings.slugExists(candidate)))
        return candidate;
    }
    throw new AppError(409, "SLUG_TAKEN", "Choose a more specific title.");
  }

  /** "No supervisor, no intern" and "assess capacity before accepting work", checked at publish time. */
  function assertCapacity(p: Pick<Posting, "slots" | "supervisorIds">): void {
    if (p.supervisorIds.length === 0) {
      throw new AppError(409, "NO_SUPERVISOR", "Assign at least one supervisor before publishing.");
    }
    const max = maxSlots(p.supervisorIds.length, perSupervisor);
    if (p.slots > max) {
      throw new AppError(
        409,
        "OVER_CAPACITY",
        `With ${String(p.supervisorIds.length)} supervisor(s) this posting can offer at most ${String(max)} slot(s).`,
      );
    }
  }

  return {
    perSupervisor,

    // ------------------------------------------------------------------ public
    async listPublic(): Promise<Posting[]> {
      const at = now();
      return (await postings.listPublished()).filter((p) => isOpenForApplications(p, at));
    },

    async getPublic(slug: string): Promise<Posting> {
      const p = await postings.findBySlug(slug);
      if (p === null || p.status !== "published") throw notFound();
      return p;
    },

    // --------------------------------------------------------------- applicant
    /** Idempotent: applying twice returns the first application unchanged. */
    async apply(
      user: User,
      slug: string,
      input: ApplyInput,
      ctx: RequestContext,
    ): Promise<{ application: Application; created: boolean; posting: Posting }> {
      const posting = await postings.findBySlug(slug);
      if (posting === null || posting.status !== "published") throw notFound();

      const existing = await applications.findByPostingAndUser(posting.id, user.id);
      if (existing !== null) return { application: existing, created: false, posting };

      const problem = checkEligibility(
        user,
        posting,
        { under18: input.under18, hasGuardian: input.guardian !== undefined },
        now(),
      );
      if (problem !== null) throw ELIGIBILITY_ERRORS[problem];

      const at = now();
      try {
        const application = await applications.create({
          postingId: posting.id,
          userId: user.id,
          statement: input.statement,
          links: input.links,
          availableFrom: input.availableFrom,
          under18: input.under18,
          guardian: input.guardian,
          status: "submitted",
          events: [{ at, by: user.id, from: null, to: "submitted" }],
          messageToApplicant: undefined,
          consentNoticeVersion: input.privacyNoticeVersion,
          consentAt: at,
          agreementAcceptedAt: undefined,
          agreementVersion: undefined,
        });
        await record("internship.apply", user.id, ctx, {
          targetType: "application",
          targetId: application.id,
        });
        await notify(user, posting.title, "received");
        return { application, created: true, posting };
      } catch (err) {
        if (err instanceof Error && err.message === "DUPLICATE") {
          const again = await applications.findByPostingAndUser(posting.id, user.id);
          if (again !== null) return { application: again, created: false, posting };
        }
        throw err;
      }
    },

    async myApplications(
      userId: string,
    ): Promise<{ application: Application; posting: Posting | null }[]> {
      const mine = await applications.listByUser(userId);
      return Promise.all(
        mine.map(async (application) => ({
          application,
          posting: await postings.findById(application.postingId),
        })),
      );
    },

    /** 404 (not 403) for someone else's application, so ids cannot be probed. */
    async myApplication(
      userId: string,
      id: string,
    ): Promise<{ application: Application; posting: Posting | null }> {
      const application = await applications.findById(id);
      if (application === null || application.userId !== userId) throw notFound();
      return { application, posting: await postings.findById(application.postingId) };
    },

    async withdraw(user: User, id: string, ctx: RequestContext): Promise<Application> {
      const { application } = await this.myApplication(user.id, id);
      if (!canWithdraw(application.status)) {
        throw new AppError(
          409,
          "CANNOT_WITHDRAW",
          "This application can no longer be withdrawn here.",
        );
      }
      const updated = await applications.transition(id, application.status, {
        at: now(),
        by: user.id,
        from: application.status,
        to: "withdrawn",
      });
      if (updated === null) throw conflict();
      await record("internship.withdraw", user.id, ctx, {
        targetType: "application",
        targetId: id,
        detail: `${application.status} -> withdrawn`,
      });
      return updated;
    },

    /** The applicant accepts an offer and the current intern agreement text in one step. */
    async accept(
      user: User,
      id: string,
      agreementVersion: string,
      ctx: RequestContext,
    ): Promise<Application> {
      const { application } = await this.myApplication(user.id, id);
      if (!canMove(application.status, "accepted", "applicant")) {
        throw new AppError(409, "NOT_OFFERED", "There is no open offer to accept.");
      }
      if (agreementVersion !== AGREEMENT_VERSION) {
        throw new AppError(
          409,
          "AGREEMENT_CHANGED",
          "The agreement was updated. Reload to read the current version.",
        );
      }
      const at = now();
      const updated = await applications.transition(
        id,
        "offered",
        { at, by: user.id, from: "offered", to: "accepted" },
        { agreementAcceptedAt: at, agreementVersion },
      );
      if (updated === null) throw conflict();
      await record("internship.accept", user.id, ctx, { targetType: "application", targetId: id });
      return updated;
    },

    async myPlacements(
      userId: string,
    ): Promise<{ placement: Placement; posting: Posting | null; supervisor: User | null }[]> {
      const mine = await placements.listByUser(userId);
      return Promise.all(
        mine.map(async (placement) => ({
          placement,
          posting: await postings.findById(placement.postingId),
          supervisor: await users.findById(placement.supervisorId),
        })),
      );
    },

    // ------------------------------------------------------------ staff: postings
    async listPostings(query: PostingListQuery): Promise<Page<Posting>> {
      return postings.list(query);
    },

    async getPosting(id: string): Promise<Posting> {
      return mustPosting(id);
    },

    async createPosting(actor: User, input: PostingInput, ctx: RequestContext): Promise<Posting> {
      await mustSupervisors(input.supervisorIds);
      const created = await postings.create({
        ...input,
        supervisorIds: [...new Set(input.supervisorIds)],
        slug: await uniqueSlug(input.title),
        status: "draft",
        createdBy: actor.id,
        publishedAt: undefined,
      });
      await record("admin.internship.posting.create", actor.id, ctx, {
        targetType: "posting",
        targetId: created.id,
      });
      return created;
    },

    async updatePosting(
      actor: User,
      id: string,
      patch: Partial<PostingInput>,
      ctx: RequestContext,
    ): Promise<Posting> {
      const current = await mustPosting(id);
      if (current.status === "closed") {
        throw new AppError(409, "POSTING_CLOSED", "A closed posting cannot be edited.");
      }
      if (patch.supervisorIds !== undefined) await mustSupervisors(patch.supervisorIds);
      const next: Posting = {
        ...current,
        ...patch,
        ...(patch.supervisorIds === undefined
          ? {}
          : { supervisorIds: [...new Set(patch.supervisorIds)] }),
      };
      if (current.status === "published") {
        assertCapacity(next);
        const running = await placements.countActiveByPosting(id);
        if (next.slots < running) {
          throw new AppError(
            409,
            "SLOTS_BELOW_PLACED",
            "Slots cannot be lower than the interns already placed.",
          );
        }
      }
      const { id: _i, slug: _s, createdAt: _c, updatedAt: _u, createdBy: _b, ...writable } = next;
      void [_i, _s, _c, _u, _b];
      const updated = await postings.update(id, writable, now());
      if (updated === null) throw notFound();
      await record("admin.internship.posting.update", actor.id, ctx, {
        targetType: "posting",
        targetId: id,
      });
      return updated;
    },

    async publishPosting(actor: User, id: string, ctx: RequestContext): Promise<Posting> {
      const current = await mustPosting(id);
      if (current.status === "closed") {
        throw new AppError(409, "POSTING_CLOSED", "A closed posting cannot be published again.");
      }
      if (current.closesAt !== undefined && current.closesAt.getTime() <= now().getTime()) {
        throw new AppError(422, "CLOSE_DATE_PAST", "The closing date is already in the past.");
      }
      await mustSupervisors(current.supervisorIds);
      assertCapacity(current);
      const updated = await postings.update(
        id,
        { status: "published", publishedAt: current.publishedAt ?? now() },
        now(),
      );
      if (updated === null) throw notFound();
      await record("admin.internship.posting.publish", actor.id, ctx, {
        targetType: "posting",
        targetId: id,
      });
      return updated;
    },

    async closePosting(actor: User, id: string, ctx: RequestContext): Promise<Posting> {
      const current = await mustPosting(id);
      if (current.status === "closed") return current;
      const updated = await postings.update(id, { status: "closed" }, now());
      if (updated === null) throw notFound();
      await record("admin.internship.posting.close", actor.id, ctx, {
        targetType: "posting",
        targetId: id,
      });
      return updated;
    },

    // ----------------------------------------------------------- staff: review
    async listApplications(query: ApplicationListQuery): Promise<Page<Application>> {
      return applications.list(query);
    },

    async getApplication(id: string): Promise<{
      application: Application;
      posting: Posting | null;
      applicant: User | null;
      placement: Placement | null;
    }> {
      const application = await mustApplication(id);
      const [posting, applicant, placement] = await Promise.all([
        postings.findById(application.postingId),
        users.findById(application.userId),
        placements.findByApplication(id),
      ]);
      return { application, posting, applicant, placement };
    },

    async transition(
      actor: User,
      id: string,
      to: ApplicationStatus,
      opts: { note?: string | undefined; message?: string | undefined },
      ctx: RequestContext,
    ): Promise<Application> {
      if (!STAFF_TARGETS.includes(to)) {
        throw new AppError(
          422,
          "INVALID_STATUS",
          "Staff cannot move an application to that status.",
        );
      }
      const application = await mustApplication(id);
      if (!canMove(application.status, to, "staff")) {
        throw new AppError(
          409,
          "INVALID_TRANSITION",
          `An application that is ${application.status} cannot become ${to}.`,
        );
      }
      const at = now();
      const updated = await applications.transition(
        id,
        application.status,
        { at, by: actor.id, from: application.status, to },
        opts.message === undefined ? {} : { messageToApplicant: opts.message },
      );
      if (updated === null) throw conflict();
      if (opts.note !== undefined && opts.note !== "") {
        await applications.addNote(id, { at, by: actor.id, text: opts.note }, at);
      }
      await record("admin.internship.application.transition", actor.id, ctx, {
        targetType: "application",
        targetId: id,
        detail: `${application.status} -> ${to}`,
      });
      const [posting, applicant] = await Promise.all([
        postings.findById(application.postingId),
        users.findById(application.userId),
      ]);
      await notify(applicant, posting?.title ?? "your application", to as InternshipMail);
      return updated;
    },

    async addNote(
      actor: User,
      id: string,
      text: string,
      score: number | undefined,
      ctx: RequestContext,
    ): Promise<Application> {
      await mustApplication(id);
      const at = now();
      const updated = await applications.addNote(id, { at, by: actor.id, text, score }, at);
      if (updated === null) throw notFound();
      await record("admin.internship.application.note", actor.id, ctx, {
        targetType: "application",
        targetId: id,
      });
      return updated;
    },

    /** Staff confirm they have spoken to the guardian of an under-18 applicant. */
    async verifyGuardian(actor: User, id: string, ctx: RequestContext): Promise<Application> {
      const application = await mustApplication(id);
      if (!application.under18 || application.guardian === undefined) {
        throw new AppError(409, "NO_GUARDIAN", "This applicant has no guardian on record.");
      }
      const updated = await applications.patch(
        id,
        { guardianVerified: { at: now(), by: actor.id } },
        now(),
      );
      if (updated === null) throw notFound();
      await record("admin.internship.guardian.verify", actor.id, ctx, {
        targetType: "application",
        targetId: id,
      });
      return updated;
    },

    // --------------------------------------------------------- staff: placements
    async place(
      actor: User,
      applicationId: string,
      input: { supervisorId: string; startsOn: Date; endsOn: Date },
      ctx: RequestContext,
    ): Promise<Placement> {
      const application = await mustApplication(applicationId);
      const posting = await mustPosting(application.postingId);
      const [supervisor] = await mustSupervisors([input.supervisorId]);
      if (supervisor === undefined) throw notFound();

      const problem = checkPlacement({
        application,
        posting,
        supervisorId: input.supervisorId,
        supervisorActive: await placements.countActiveBySupervisor(input.supervisorId),
        activeOnPosting: await placements.countActiveByPosting(posting.id),
        perSupervisor,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      });
      if (problem !== null) throw PLACEMENT_ERRORS[problem];

      const at = now();
      // Claim the application first so two staff members cannot place the same person twice.
      const claimed = await applications.transition(applicationId, "accepted", {
        at,
        by: actor.id,
        from: "accepted",
        to: "placed",
      });
      if (claimed === null) throw conflict();

      let placement: Placement;
      try {
        placement = await placements.create({
          applicationId,
          postingId: posting.id,
          userId: application.userId,
          supervisorId: input.supervisorId,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          status: "active",
          agreementVersion: application.agreementVersion ?? AGREEMENT_VERSION,
          agreementAcceptedAt: application.agreementAcceptedAt ?? at,
          createdBy: actor.id,
        });
      } catch (err) {
        // Put the application back so the placement can be retried. This is the one move that is not
        // in the public rules table, because it is an undo of our own claim.
        await applications.transition(applicationId, "placed", {
          at: now(),
          by: "system",
          from: "placed",
          to: "accepted",
        });
        throw err;
      }

      const intern = await users.findById(application.userId);
      if (intern !== null && !intern.roles.includes("intern")) {
        await users.setRoles(intern.id, [...intern.roles, "intern"]);
      }
      await record("admin.internship.placement.create", actor.id, ctx, {
        targetType: "placement",
        targetId: placement.id,
      });
      await notify(intern, posting.title, "placed");
      return placement;
    },

    async listPlacements(query: PlacementListQuery): Promise<Page<Placement>> {
      return placements.list(query);
    },

    async getPlacement(id: string): Promise<{
      placement: Placement;
      posting: Posting | null;
      intern: User | null;
      supervisor: User | null;
    }> {
      const placement = await placements.findById(id);
      if (placement === null) throw notFound();
      const [posting, intern, supervisor] = await Promise.all([
        postings.findById(placement.postingId),
        users.findById(placement.userId),
        users.findById(placement.supervisorId),
      ]);
      return { placement, posting, intern, supervisor };
    },

    async endPlacement(
      actor: User,
      id: string,
      status: Exclude<PlacementStatus, "active">,
      summary: string | undefined,
      ctx: RequestContext,
    ): Promise<Placement> {
      const ended = await placements.end(id, status, summary, now());
      if (ended === null) {
        if ((await placements.findById(id)) === null) throw notFound();
        throw new AppError(409, "ALREADY_ENDED", "This placement has already ended.");
      }
      // The intern role is for people with a running placement only.
      const others = (await placements.listByUser(ended.userId)).filter(
        (p) => p.status === "active",
      );
      if (others.length === 0) {
        const intern = await users.findById(ended.userId);
        if (intern?.roles.includes("intern") === true) {
          await users.setRoles(
            intern.id,
            intern.roles.filter((r) => r !== "intern"),
          );
        }
      }
      await record("admin.internship.placement.end", actor.id, ctx, {
        targetType: "placement",
        targetId: id,
        detail: `active -> ${status}`,
      });
      return ended;
    },

    async reassignSupervisor(
      actor: User,
      id: string,
      supervisorId: string,
      ctx: RequestContext,
    ): Promise<Placement> {
      const placement = await placements.findById(id);
      if (placement === null) throw notFound();
      if (placement.status !== "active") {
        throw new AppError(409, "ALREADY_ENDED", "Only an active placement can change supervisor.");
      }
      if (placement.supervisorId === supervisorId) return placement;
      const posting = await mustPosting(placement.postingId);
      await mustSupervisors([supervisorId]);
      if (!posting.supervisorIds.includes(supervisorId))
        throw PLACEMENT_ERRORS.SUPERVISOR_NOT_ON_POSTING;
      if ((await placements.countActiveBySupervisor(supervisorId)) >= perSupervisor) {
        throw PLACEMENT_ERRORS.SUPERVISOR_FULL;
      }
      const updated = await placements.setSupervisor(id, supervisorId, now());
      if (updated === null) throw notFound();
      await record("admin.internship.placement.reassign", actor.id, ctx, {
        targetType: "placement",
        targetId: id,
      });
      return updated;
    },

    // ------------------------------------------------------------- supervisors
    async supervisorPlacements(
      supervisorId: string,
    ): Promise<{ placement: Placement; posting: Posting | null; intern: User | null }[]> {
      const mine = await placements.listBySupervisor(supervisorId);
      return Promise.all(
        mine.map(async (placement) => ({
          placement,
          posting: await postings.findById(placement.postingId),
          intern: await users.findById(placement.userId),
        })),
      );
    },

    /** A supervisor can only write on their own, still-running placements. */
    async addFeedback(
      supervisor: User,
      placementId: string,
      input: { text: string; rating?: number | undefined; visibleToIntern: boolean },
      ctx: RequestContext,
    ): Promise<Placement> {
      const placement = await placements.findById(placementId);
      if (placement === null || placement.supervisorId !== supervisor.id) throw notFound();
      if (placement.status !== "active") {
        throw new AppError(409, "ALREADY_ENDED", "This placement has ended.");
      }
      const at = now();
      const updated = await placements.addFeedback(
        placementId,
        {
          at,
          by: supervisor.id,
          text: input.text,
          rating: input.rating,
          visibleToIntern: input.visibleToIntern,
        },
        at,
      );
      if (updated === null) throw notFound();
      await record("internship.feedback", supervisor.id, ctx, {
        targetType: "placement",
        targetId: placementId,
      });
      return updated;
    },

    // -------------------------------------------------------------- dashboards
    async supervisorsWithLoad(): Promise<{ user: User; active: number; capacity: number }[]> {
      const [list, load] = await Promise.all([
        users.list({ role: "supervisor", page: 1, pageSize: 100 }),
        placements.activeLoadBySupervisor(),
      ]);
      return list.items
        .filter((u) => u.deletedAt === undefined && u.suspendedAt === undefined)
        .map((user) => ({ user, active: load[user.id] ?? 0, capacity: perSupervisor }));
    },

    async stats() {
      const [postingCounts, applicationCounts, supervisors, activePlacements] = await Promise.all([
        postings.countByStatus(),
        applications.countByStatus(),
        this.supervisorsWithLoad(),
        placements.list({ status: "active", page: 1, pageSize: 1 }),
      ]);
      const total = Object.values(applicationCounts).reduce((n, v) => n + v, 0);
      const decided =
        applicationCounts.offered + applicationCounts.accepted + applicationCounts.placed;
      return {
        postings: postingCounts,
        applications: applicationCounts,
        totalApplications: total,
        offerRate: total === 0 ? 0 : Math.round((decided / total) * 1000) / 10,
        activePlacements: activePlacements.total,
        supervisors: supervisors.map((s) => ({
          id: s.user.id,
          name: s.user.displayName,
          active: s.active,
          capacity: s.capacity,
        })),
      };
    },
  };
}

export type InternshipService = ReturnType<typeof createInternshipService>;
