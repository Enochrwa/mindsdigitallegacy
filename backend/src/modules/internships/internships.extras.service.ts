import { AppError, notFound } from "../../core/errors.js";
import { ipPrefix } from "../../core/security/tokens.js";
import type { AuditAction, AuditLog } from "../audit/audit.js";
import type { RequestContext } from "../auth/auth.service.js";
import type { Mailer } from "../auth/mailer.js";
import type { UserRepository } from "../users/users.repository.js";
import { isActive } from "../users/users.types.js";
import type { User } from "../users/users.types.js";
import {
  DAY_MS,
  facetsOf,
  facts,
  matchesText,
  paginate,
  passesFilters,
  similarTo,
  skillMatch,
  sortCandidates,
  tokens,
} from "./internships.discovery.js";
import type {
  Candidate,
  Competition,
  Facets,
  Facts,
  SearchQuery,
  SkillMatch,
} from "./internships.discovery.js";
import type {
  ExtrasRepositories,
  InternshipAlert,
  InternshipDraft,
  InternshipProfile,
} from "./internships.extras.types.js";
import type {
  ApplicationRepository,
  PlacementRepository,
  PostingRepository,
} from "./internships.repository.js";
import { checkEligibility, cleanLink, isOpenForApplications } from "./internships.rules.js";
import type { EligibilityProblem } from "./internships.rules.js";
import type { Department, Posting, ScreeningAnswer, WorkMode } from "./internships.types.js";

export interface ExtrasDeps {
  postings: PostingRepository;
  applications: ApplicationRepository;
  placements: PlacementRepository;
  users: UserRepository;
  extras: ExtrasRepositories;
  audit: AuditLog;
  mailer: Mailer;
  /** Same limit the apply endpoint enforces, so the "can I apply?" answer never disagrees with it. */
  maxOpenApplications: number;
  now?: () => Date;
}

/** A posting together with everything a card or a detail page shows next to it. */
export interface PostingView {
  posting: Posting;
  facts: Facts;
  competition: Competition;
  match?: SkillMatch | undefined;
  saved: boolean;
}

export interface SearchResult {
  items: PostingView[];
  total: number;
  page: number;
  pageSize: number;
  facets: Facets;
  /** The sort actually used (best match falls back to newest when the viewer has no profile). */
  sort: SearchQuery["sort"];
}

export type ApplyBlocker =
  "SIGN_IN" | "VERIFY_EMAIL" | "TOO_YOUNG" | "POSTING_CLOSED" | "ALREADY_APPLIED" | "TOO_MANY_OPEN";

export interface ApplyCheck {
  signedIn: boolean;
  canApply: boolean;
  blockers: ApplyBlocker[];
  application: { id: string; status: string } | null;
  openApplications: number;
  maxOpenApplications: number;
  profileComplete: boolean;
  hasDraft: boolean;
  saved: boolean;
  match: SkillMatch | null;
}

const MAX_SAVED = 50;
const ALERT_BATCH = 200;
const REMINDER_BATCH = 200;
const REMINDER_DAYS = 3;

/** A profile is complete enough for one-step applying when it says who the person is and what they know. */
export const isProfileComplete = (p: InternshipProfile | null): boolean =>
  p !== null && p.headline.trim() !== "" && p.institution.trim() !== "" && p.skills.length > 0;

export function createExtrasService(deps: ExtrasDeps) {
  const { postings, applications, placements, users, extras, audit, mailer } = deps;
  const now = deps.now ?? ((): Date => new Date());

  async function record(
    action: AuditAction,
    actorId: string | undefined,
    ctx: RequestContext | undefined,
    detail?: string,
  ): Promise<void> {
    await audit.append({
      at: now(),
      actorId,
      action,
      requestId: ctx?.requestId ?? "system:internships",
      ipPrefix: ctx === undefined ? "system" : ipPrefix(ctx.ip),
      outcome: "success",
      meta: { targetType: "internships", detail },
    });
  }

  async function openPostings(): Promise<Posting[]> {
    const at = now();
    return (await postings.listPublished()).filter((p) => isOpenForApplications(p, at));
  }

  async function candidatesFor(list: Posting[], viewer: User | null): Promise<Candidate[]> {
    const ids = list.map((p) => p.id);
    const [applicants, running, profile] = await Promise.all([
      applications.countsByPosting(ids),
      placements.activeCountsByPosting(ids),
      viewer === null ? Promise.resolve(null) : extras.profiles.get(viewer.id),
    ]);
    const at = now();
    return list.map((posting) => {
      const competition: Competition = {
        applicants: applicants[posting.id] ?? 0,
        placesOpen: Math.max(0, posting.slots - (running[posting.id] ?? 0)),
      };
      return {
        posting,
        competition,
        facts: facts(posting, competition, at),
        match: profile === null ? undefined : skillMatch(profile.skills, posting.skills),
      };
    });
  }

  const savedSet = async (viewer: User | null): Promise<Set<string>> =>
    new Set(
      viewer === null ? [] : (await extras.saves.listByUser(viewer.id)).map((s) => s.postingId),
    );

  const view = (c: Candidate, saved: Set<string>): PostingView => ({
    posting: c.posting,
    facts: c.facts,
    competition: c.competition,
    match: c.match,
    saved: saved.has(c.posting.id),
  });

  async function mustOpenSlug(slug: string): Promise<Posting> {
    const p = await postings.findBySlug(slug);
    if (p === null || p.status !== "published") throw notFound();
    return p;
  }

  return {
    isProfileComplete,

    // ----------------------------------------------------------------- discovery
    async search(query: SearchQuery, viewer: User | null): Promise<SearchResult> {
      const all = await candidatesFor(await openPostings(), viewer);
      const saved = await savedSet(viewer);
      const wantsMatch = query.sort === "best_match";
      const hasProfile = all.some((c) => c.match !== undefined);
      const sort = wantsMatch && !hasProfile ? "newest" : query.sort;
      const filtered = sortCandidates(
        all.filter((c) => passesFilters(c, query)),
        sort,
      );
      return {
        items: paginate(filtered, query.page, query.pageSize).map((c) => view(c, saved)),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
        facets: facetsOf(all),
        sort,
      };
    },

    async detail(slug: string, viewer: User | null) {
      const posting = await mustOpenSlug(slug);
      const open = await openPostings();
      const all = await candidatesFor(open, viewer);
      const saved = await savedSet(viewer);
      const self =
        all.find((c) => c.posting.id === posting.id) ?? (await candidatesFor([posting], viewer))[0];
      if (self === undefined) throw notFound();
      const similar = similarTo(
        posting,
        open.filter((p) => p.id !== posting.id),
      )
        .map((p) => all.find((c) => c.posting.id === p.id))
        .filter((c): c is Candidate => c !== undefined)
        .map((c) => view(c, saved));
      const mine =
        viewer === null ? null : await applications.findByPostingAndUser(posting.id, viewer.id);
      return {
        ...view(self, saved),
        similar,
        applied: mine === null ? null : { id: mine.id, status: mine.status },
      };
    },

    /**
     * "Can I apply?" answered before the person fills anything in: what is in the way, whether they already
     * applied, how they match, and whether a saved profile or draft can speed things up.
     */
    async applyCheck(viewer: User | null, slug: string): Promise<ApplyCheck> {
      const posting = await mustOpenSlug(slug);
      const base = {
        maxOpenApplications: deps.maxOpenApplications,
        openApplications: 0,
        profileComplete: false,
        hasDraft: false,
        saved: false,
        match: null,
      };
      if (viewer === null) {
        return {
          ...base,
          signedIn: false,
          canApply: false,
          blockers: ["SIGN_IN"],
          application: null,
        };
      }
      const [existing, open, profile, draft, saved] = await Promise.all([
        applications.findByPostingAndUser(posting.id, viewer.id),
        applications.countOpenByUser(viewer.id),
        extras.profiles.get(viewer.id),
        extras.drafts.get(viewer.id, posting.id),
        extras.saves.has(viewer.id, posting.id),
      ]);
      const blockers: ApplyBlocker[] = [];
      if (existing !== null) blockers.push("ALREADY_APPLIED");
      else {
        const problem: EligibilityProblem | null = checkEligibility(
          viewer,
          posting,
          {
            under18: false,
            hasGuardian: false,
            openCount: open,
            maxOpen: deps.maxOpenApplications,
          },
          now(),
        );
        if (problem === "NOT_ACTIVE") blockers.push("VERIFY_EMAIL");
        else if (problem === "TOO_YOUNG") blockers.push("TOO_YOUNG");
        else if (problem === "POSTING_CLOSED") blockers.push("POSTING_CLOSED");
        else if (problem === "TOO_MANY_OPEN") blockers.push("TOO_MANY_OPEN");
      }
      return {
        signedIn: true,
        canApply: blockers.length === 0,
        blockers,
        application: existing === null ? null : { id: existing.id, status: existing.status },
        openApplications: open,
        maxOpenApplications: deps.maxOpenApplications,
        profileComplete: isProfileComplete(profile),
        hasDraft: draft !== null,
        saved,
        match: profile === null ? null : skillMatch(profile.skills, posting.skills),
      };
    },

    // -------------------------------------------------------------------- profile
    getProfile: (userId: string) => extras.profiles.get(userId),

    async saveProfile(
      user: User,
      input: Omit<InternshipProfile, "userId" | "updatedAt">,
    ): Promise<InternshipProfile> {
      const links = input.links.map(cleanLink);
      if (links.some((l) => l === null)) {
        throw new AppError(422, "VALIDATION_ERROR", "Links must start with https://.");
      }
      const skills = [...new Set(input.skills.map((s) => s.trim()).filter((s) => s !== ""))].slice(
        0,
        15,
      );
      return extras.profiles.upsert({
        ...input,
        skills,
        links: links.filter((l): l is string => l !== null),
        userId: user.id,
        updatedAt: now(),
      });
    },

    async deleteProfile(user: User): Promise<void> {
      await extras.profiles.remove(user.id);
    },

    // --------------------------------------------------------------------- drafts
    async getDraft(user: User, slug: string): Promise<InternshipDraft | null> {
      const posting = await postings.findBySlug(slug);
      if (posting === null) return null;
      return extras.drafts.get(user.id, posting.id);
    },

    /** Saved as the person types, so a lost connection or a closed tab never loses their answer. */
    async saveDraft(
      user: User,
      slug: string,
      input: {
        statement: string;
        links: string[];
        answers: ScreeningAnswer[];
        availableFrom?: Date | undefined;
      },
    ): Promise<InternshipDraft> {
      const posting = await mustOpenSlug(slug);
      if ((await applications.findByPostingAndUser(posting.id, user.id)) !== null) {
        throw new AppError(409, "ALREADY_APPLIED", "You have already applied to this internship.");
      }
      const known = new Set(posting.screeningQuestions.map((q) => q.id));
      return extras.drafts.upsert({
        userId: user.id,
        postingId: posting.id,
        statement: input.statement,
        links: input.links.map((l) => cleanLink(l)).filter((l): l is string => l !== null),
        answers: input.answers.filter((a) => known.has(a.questionId)),
        availableFrom: input.availableFrom,
        updatedAt: now(),
      });
    },

    async deleteDraft(user: User, slug: string): Promise<void> {
      const posting = await postings.findBySlug(slug);
      if (posting !== null) await extras.drafts.remove(user.id, posting.id);
    },

    // ---------------------------------------------------------------------- saves
    async save(user: User, slug: string): Promise<void> {
      const posting = await mustOpenSlug(slug);
      const mine = await extras.saves.listByUser(user.id);
      if (!mine.some((s) => s.postingId === posting.id) && mine.length >= MAX_SAVED) {
        throw new AppError(
          409,
          "TOO_MANY_SAVED",
          `You can save up to ${String(MAX_SAVED)} internships.`,
        );
      }
      await extras.saves.add(user.id, posting.id, now());
    },

    async unsave(user: User, slug: string): Promise<void> {
      const posting = await postings.findBySlug(slug);
      if (posting !== null) await extras.saves.remove(user.id, posting.id);
    },

    /** Saved internships, including ones that have since closed (shown as closed rather than vanishing). */
    async listSaved(viewer: User): Promise<(PostingView & { open: boolean })[]> {
      const rows = await extras.saves.listByUser(viewer.id);
      const found = (await Promise.all(rows.map((r) => postings.findById(r.postingId)))).filter(
        (p): p is Posting => p !== null && p.status !== "draft",
      );
      const cands = await candidatesFor(found, viewer);
      const at = now();
      return cands.map((c) => ({
        ...view(c, new Set(found.map((p) => p.id))),
        open: isOpenForApplications(c.posting, at),
      }));
    },

    // --------------------------------------------------------------------- alerts
    getAlert: (userId: string) => extras.alerts.get(userId),

    async setAlert(
      user: User,
      input: { departments: Department[]; modes: WorkMode[]; keywords: string; active: boolean },
    ): Promise<InternshipAlert> {
      const prev = await extras.alerts.get(user.id);
      const at = now();
      return extras.alerts.upsert({
        userId: user.id,
        departments: [...new Set(input.departments)],
        modes: [...new Set(input.modes)],
        keywords: input.keywords.trim().slice(0, 60),
        active: input.active,
        createdAt: prev?.createdAt ?? at,
        updatedAt: at,
      });
    },

    async deleteAlert(user: User): Promise<void> {
      await extras.alerts.remove(user.id);
    },

    /** Mails people whose alert matches a posting that just went live. At most 200 per posting. */
    async notifyAlerts(posting: Posting): Promise<number> {
      const alerts = await extras.alerts.listActive(1000);
      const words = (a: InternshipAlert): string[] => tokens(a.keywords);
      const matching = alerts
        .filter((a) => a.departments.length === 0 || a.departments.includes(posting.department))
        .filter((a) => a.modes.length === 0 || a.modes.includes(posting.mode))
        .filter((a) => matchesText(posting, words(a)))
        .slice(0, ALERT_BATCH);
      let sent = 0;
      for (const alert of matching) {
        const user = await users.findById(alert.userId);
        if (user === null || !isActive(user)) continue;
        try {
          await mailer.sendInternshipAlert(
            user.email,
            user.displayName,
            posting.title,
            posting.slug,
          );
          sent += 1;
        } catch {
          /* a mail problem never stops the others */
        }
      }
      if (sent > 0)
        await record(
          "internship.alerts.sent",
          undefined,
          undefined,
          `${String(sent)} for ${posting.slug}`,
        );
      return sent;
    },

    // ----------------------------------------------------------------- automation
    /**
     * The hourly housekeeping, safe to run twice:
     *  1. close postings whose deadline has passed, so nobody applies to a closed door;
     *  2. remind people (once) about a saved internship or an unfinished application that closes within 3 days.
     */
    async runAutomation(): Promise<{ closed: number; reminders: number }> {
      const at = now();
      const published = await postings.listPublished();
      let closed = 0;
      for (const p of published) {
        if (p.closesAt !== undefined && p.closesAt.getTime() <= at.getTime()) {
          await postings.update(p.id, { status: "closed" }, at);
          closed += 1;
        }
      }

      const soon = published.filter(
        (p) =>
          p.closesAt !== undefined &&
          p.closesAt.getTime() > at.getTime() &&
          p.closesAt.getTime() - at.getTime() <= REMINDER_DAYS * DAY_MS,
      );
      const ids = soon.map((p) => p.id);
      const byId = new Map(soon.map((p) => [p.id, p]));
      let reminders = 0;
      if (ids.length > 0) {
        const [drafts, saves] = await Promise.all([
          extras.drafts.listForReminder(ids),
          extras.saves.listForReminder(ids),
        ]);
        // A person with both a draft and a save gets one email, saying the more useful thing ("finish it").
        const todo = new Map<
          string,
          { userId: string; postingId: string; kind: "saved" | "draft" }
        >();
        for (const s of saves)
          todo.set(`${s.userId}|${s.postingId}`, {
            userId: s.userId,
            postingId: s.postingId,
            kind: "saved",
          });
        for (const d of drafts)
          todo.set(`${d.userId}|${d.postingId}`, {
            userId: d.userId,
            postingId: d.postingId,
            kind: "draft",
          });

        for (const item of [...todo.values()].slice(0, REMINDER_BATCH)) {
          const posting = byId.get(item.postingId);
          const user = await users.findById(item.userId);
          const applied = await applications.findByPostingAndUser(item.postingId, item.userId);
          // Mark it reminded either way, so a person who already applied (or left) is never mailed later.
          await Promise.all([
            extras.saves.markReminded(item.userId, item.postingId, at),
            extras.drafts.markReminded(item.userId, item.postingId, at),
          ]);
          if (posting === undefined || user === null || !isActive(user) || applied !== null)
            continue;
          const days = Math.max(
            0,
            Math.ceil(((posting.closesAt?.getTime() ?? at.getTime()) - at.getTime()) / DAY_MS),
          );
          try {
            await mailer.sendInternshipReminder(
              user.email,
              user.displayName,
              posting.title,
              posting.slug,
              days,
              item.kind,
            );
            reminders += 1;
          } catch {
            /* ignore: one failed mail must not stop the batch */
          }
        }
      }
      if (closed > 0 || reminders > 0) {
        await record(
          "internship.automation.run",
          undefined,
          undefined,
          `closed ${String(closed)}, reminders ${String(reminders)}`,
        );
      }
      return { closed, reminders };
    },
  };
}

export type ExtrasService = ReturnType<typeof createExtrasService>;
