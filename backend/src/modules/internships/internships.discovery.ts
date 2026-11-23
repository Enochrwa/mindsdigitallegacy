import { DEPARTMENT_LABELS } from "./internships.labels.js";
import type { Compensation, Department, Posting, WorkMode } from "./internships.types.js";

/**
 * Finding internships: text search, filters, sorting, and the little facts shown on every card
 * ("new", "closing in 3 days", "12 applicants"). Pure functions, no database, so they are tested
 * exhaustively and behave the same for any storage.
 */

export const DAY_MS = 86_400_000;
const NEW_DAYS = 7;
const CLOSING_SOON_DAYS = 7;

// ------------------------------------------------------------------ skills

/** A few spellings people use for the same skill, so "JS" matches "JavaScript". */
const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  node: "nodejs",
  "node.js": "nodejs",
  reactjs: "react",
  "react.js": "react",
  "ms excel": "excel",
  "microsoft excel": "excel",
  "ms word": "word",
  "microsoft word": "word",
  "ui/ux": "ui ux",
  "ux/ui": "ui ux",
  "ui design": "ui ux",
  "ux design": "ui ux",
  html5: "html",
  css3: "css",
  python3: "python",
  "social media": "social media marketing",
  "ms office": "office",
  "microsoft office": "office",
};

export function normaliseSkill(raw: string): string {
  const clean = raw.toLowerCase().replace(/\s+/g, " ").trim();
  return ALIASES[clean] ?? clean;
}

export interface SkillMatch {
  percent: number;
  matched: string[];
  missing: string[];
}

/**
 * How many of the posting's skills the person lists. A posting with no listed skills matches everyone
 * (there is nothing to be missing), reported as 100 with empty lists.
 */
export function skillMatch(mine: readonly string[], wanted: readonly string[]): SkillMatch {
  if (wanted.length === 0) return { percent: 100, matched: [], missing: [] };
  const have = new Set(mine.map(normaliseSkill));
  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of wanted) (have.has(normaliseSkill(skill)) ? matched : missing).push(skill);
  return { percent: Math.round((matched.length / wanted.length) * 100), matched, missing };
}

// ---------------------------------------------------------------- derived facts

export interface Competition {
  applicants: number;
  /** Places not yet filled (slots minus running placements). */
  placesOpen: number;
}

export interface Facts {
  isNew: boolean;
  closingSoon: boolean;
  /** Whole days until the deadline, or null when there is none. */
  daysLeft: number | null;
  /** True while few people have applied, as Internshala's "be an early applicant". */
  earlyApplicant: boolean;
  postedDaysAgo: number;
}

export function facts(p: Posting, c: Competition, now: Date): Facts {
  const posted = p.publishedAt ?? p.createdAt;
  const postedDaysAgo = Math.max(0, Math.floor((now.getTime() - posted.getTime()) / DAY_MS));
  const daysLeft =
    p.closesAt === undefined ? null : Math.ceil((p.closesAt.getTime() - now.getTime()) / DAY_MS);
  return {
    isNew: postedDaysAgo < NEW_DAYS,
    closingSoon: daysLeft !== null && daysLeft >= 0 && daysLeft <= CLOSING_SOON_DAYS,
    daysLeft,
    earlyApplicant: c.applicants < Math.max(5, p.slots * 2),
    postedDaysAgo,
  };
}

// --------------------------------------------------------------------- search

export const SORTS = ["newest", "closing", "shortest", "most_places", "best_match"] as const;
export type Sort = (typeof SORTS)[number];

export interface SearchQuery {
  q?: string | undefined;
  department?: readonly Department[] | undefined;
  mode?: readonly WorkMode[] | undefined;
  compensation?: readonly Compensation[] | undefined;
  /** Longest acceptable duration in weeks. */
  maxWeeks?: number | undefined;
  /** Only postings a 16 or 17 year old may apply to. */
  openToUnder18?: boolean | undefined;
  closingSoon?: boolean | undefined;
  /** Only postings that start on or before this date (postings with no fixed start always qualify). */
  startsBy?: Date | undefined;
  sort: Sort;
  page: number;
  pageSize: number;
}

/** Words typed into the search box, lowercased, short noise removed, at most 8. */
export function tokens(q: string | undefined): string[] {
  if (q === undefined) return [];
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 8);
}

const haystack = (p: Posting): string =>
  [p.title, p.summary, p.location, DEPARTMENT_LABELS[p.department], ...p.skills]
    .join(" ")
    .toLowerCase();

/** Every typed word must appear somewhere in the title, summary, skills, location or department. */
export function matchesText(p: Posting, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const text = haystack(p);
  return words.every((w) => text.includes(normaliseSkill(w)) || text.includes(w));
}

export interface Candidate {
  posting: Posting;
  facts: Facts;
  competition: Competition;
  match?: SkillMatch | undefined;
}

export function passesFilters(c: Candidate, q: SearchQuery): boolean {
  const p = c.posting;
  if (!matchesText(p, tokens(q.q))) return false;
  if (q.department !== undefined && q.department.length > 0 && !q.department.includes(p.department))
    return false;
  if (q.mode !== undefined && q.mode.length > 0 && !q.mode.includes(p.mode)) return false;
  if (
    q.compensation !== undefined &&
    q.compensation.length > 0 &&
    !q.compensation.includes(p.compensation)
  )
    return false;
  if (q.maxWeeks !== undefined && p.durationWeeks > q.maxWeeks) return false;
  if (q.openToUnder18 === true && p.minAge !== 16) return false;
  if (q.closingSoon === true && !c.facts.closingSoon) return false;
  if (
    q.startsBy !== undefined &&
    p.startsOn !== undefined &&
    p.startsOn.getTime() > q.startsBy.getTime()
  )
    return false;
  return true;
}

const byNewest = (a: Candidate, b: Candidate): number =>
  (b.posting.publishedAt ?? b.posting.createdAt).getTime() -
  (a.posting.publishedAt ?? a.posting.createdAt).getTime();

export function sortCandidates(list: Candidate[], sort: Sort): Candidate[] {
  const out = [...list];
  switch (sort) {
    case "closing":
      // Soonest deadline first; postings with no deadline last.
      return out.sort(
        (a, b) =>
          (a.posting.closesAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
            (b.posting.closesAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || byNewest(a, b),
      );
    case "shortest":
      return out.sort(
        (a, b) => a.posting.durationWeeks - b.posting.durationWeeks || byNewest(a, b),
      );
    case "most_places":
      return out.sort(
        (a, b) => b.competition.placesOpen - a.competition.placesOpen || byNewest(a, b),
      );
    case "best_match":
      return out.sort(
        (a, b) => (b.match?.percent ?? -1) - (a.match?.percent ?? -1) || byNewest(a, b),
      );
    default:
      return out.sort(byNewest);
  }
}

export interface Facets {
  department: Record<string, number>;
  mode: Record<string, number>;
  compensation: Record<string, number>;
}

/** How many open postings fall under each filter option, so the filter list can say "Remote (3)". */
export function facetsOf(list: readonly Candidate[]): Facets {
  const out: Facets = { department: {}, mode: {}, compensation: {} };
  for (const { posting: p } of list) {
    out.department[p.department] = (out.department[p.department] ?? 0) + 1;
    out.mode[p.mode] = (out.mode[p.mode] ?? 0) + 1;
    out.compensation[p.compensation] = (out.compensation[p.compensation] ?? 0) + 1;
  }
  return out;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): T[] {
  return items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
}

/** Postings similar to one: same department first, then shared skills, newest first. At most `limit`. */
export function similarTo(target: Posting, pool: readonly Posting[], limit = 3): Posting[] {
  const mine = new Set(target.skills.map(normaliseSkill));
  return pool
    .filter((p) => p.id !== target.id)
    .map((p) => ({
      p,
      score:
        (p.department === target.department ? 10 : 0) +
        p.skills.filter((s) => mine.has(normaliseSkill(s))).length,
    }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.p.publishedAt ?? b.p.createdAt).getTime() - (a.p.publishedAt ?? a.p.createdAt).getTime(),
    )
    .slice(0, limit)
    .map((x) => x.p);
}
