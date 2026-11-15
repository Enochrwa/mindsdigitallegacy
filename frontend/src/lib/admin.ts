/**
 * Admin console client: types that mirror backend/src/modules/admin/*, pure helpers (tested in
 * admin.test.ts) and thin react-query hooks. Nothing here trusts the browser for permissions:
 * the server decides what each person may see and do, the UI only reflects it.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { request } from "./api";
import type { ApiFailure, ApiResult } from "./api";

// ---------------------------------------------------------------- shared types

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type Role = "learner" | "intern" | "supervisor" | "support" | "editor" | "admin";
export const ROLES: readonly Role[] = [
  "learner",
  "intern",
  "supervisor",
  "support",
  "editor",
  "admin",
];

export interface AdminModule {
  key: string;
  label: string;
  path: string;
  permission: string;
  group: string;
}

export interface AdminMeta {
  user: { id: string; email: string; displayName: string; roles: Role[] };
  mfa: { enabled: boolean; verified: boolean; recoveryCodesLeft: number };
  permissions: string[];
  modules: AdminModule[];
}

export type DayCount = { day: string; count: number };

export interface Overview {
  days: number;
  users: { total: number; verified: number; suspended: number };
  leads: {
    byStatus: Record<string, number>;
    byKind: Record<string, number>;
    overdueFollowUps: number;
  };
  referrals: {
    funnel: {
      byType: Record<string, number>;
      byVariant: Record<string, Record<string, number>>;
    };
    reviewQueue: number;
    qualificationRate: number;
  };
  courses: {
    byStatus: Record<string, number>;
    perCourse: {
      slug: string;
      title: string;
      status: string;
      active: number;
      completed: number;
      withdrawn: number;
      locked: number;
      completionRate: number;
    }[];
  };
  series: {
    signups: DayCount[];
    enrolments: DayCount[];
    leads: DayCount[];
    qualifiedReferrals: DayCount[];
  };
}

export type UserState = "active" | "unverified" | "suspended" | "deleted";
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  roles: Role[];
  state: UserState;
  ageBracket: "under_16" | "16_plus";
  emailVerifiedAt?: string;
  guardian?: { email: string; consentAt?: string };
  suspendedAt?: string;
  suspendedReason?: string;
  lockedUntil?: string;
  failedLogins: number;
  mfaEnabled: boolean;
  createdAt: string;
  deletedAt?: string;
}

export interface UserDetail {
  user: AdminUser;
  enrolments: {
    courseSlug: string;
    courseTitle: string;
    status: string;
    access: string;
    via?: string;
    enrolledAt: string;
    completedAt?: string;
    lastActivityAt?: string;
  }[];
  entitlements: {
    id: string;
    scope: string;
    via: string;
    note?: string;
    grantedAt: string;
    grantedBy?: string;
    revokedAt?: string;
  }[];
  referral: {
    code?: string;
    codeStatus?: string;
    assignedThreshold?: number;
    counts: Record<string, number>;
    invitedBy: { referrerId: string; status: string; reason?: string } | null;
  };
  activity: {
    at: string;
    action: string;
    outcome: string;
    actorId?: string;
    detail?: string;
    targetId?: string;
  }[];
}

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "closed",
  "spam",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_PRIORITIES = ["low", "normal", "high"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];
export const LEAD_KINDS = [
  "contact",
  "service_request",
  "partner_inquiry",
  "course_interest",
  "internship_interest",
] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export interface LeadNote {
  at: string;
  by: string;
  text: string;
}
export interface Lead {
  id: string;
  kind: LeadKind;
  fullName: string;
  email: string;
  phone?: string;
  organization?: string;
  message?: string;
  service?: string;
  budget?: string;
  partnerType?: string;
  interest?: string;
  ageBracket?: string;
  guardianContact?: string;
  status: LeadStatus;
  priority: LeadPriority;
  assignedTo?: string;
  tags: string[];
  followUpAt?: string;
  statusChangedAt?: string;
  createdAt: string;
  notes: LeadNote[];
}
export type LeadRow = Omit<Lead, "notes"> & { noteCount: number };
export interface LeadList extends Page<LeadRow> {
  counts: Record<string, number>;
  overdue: number;
}

export const REFERRAL_STATUSES = [
  "pending",
  "qualified",
  "needs_review",
  "rejected",
  "revoked",
] as const;
export const REJECT_REASONS = [
  "self_referral",
  "disposable_email",
  "duplicate_contact",
  "network_cap",
  "velocity",
  "referrer_inactive",
  "invitee_inactive",
  "staff_rejected",
  "fraud_revoked",
] as const;
export interface Person {
  id: string;
  displayName?: string;
  email?: string;
}
export interface ReferralRow {
  id: string;
  status: (typeof REFERRAL_STATUSES)[number];
  reason?: string;
  code: string;
  referrer: Person;
  invitee: Person;
  network?: string;
  createdAt: string;
  qualifiedAt?: string;
  reviewedAt?: string;
}
export interface ReferralCodeRow {
  id: string;
  userId: string;
  code: string;
  status: "active" | "disabled";
  assignedThreshold?: number;
  createdAt: string;
  owner: Person;
  counts: Record<string, number>;
}

export const UNLOCK_KINDS = ["ambassador", "partner", "promo"] as const;
export interface UnlockCodeRow {
  id: string;
  code: string;
  kind: (typeof UNLOCK_KINDS)[number];
  label: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt?: string;
  status: "active" | "disabled";
  courseIds: string[];
  createdAt: string;
}

export const COURSE_STATUSES = ["draft", "published", "archived"] as const;
export const COURSE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const LANGUAGES = ["en", "rw", "fr"] as const;
export const LESSON_KINDS = ["video", "reading"] as const;

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "note"; tone?: "tip" | "warning" | "info"; text: string }
  | { type: "code"; language?: string; text: string };
export type BlockType = Block["type"];
export const BLOCK_TYPES: readonly BlockType[] = ["heading", "paragraph", "list", "note", "code"];

export type UnlockPolicy =
  { type: "open" } | { type: "referral"; threshold: number } | { type: "code" };

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  order: number;
  visible: boolean;
  source?: string;
}
export interface Course {
  id: string;
  slug: string;
  categoryId: string;
  title: string;
  summary: string;
  description: Block[];
  level: (typeof COURSE_LEVELS)[number];
  language: (typeof LANGUAGES)[number];
  status: (typeof COURSE_STATUSES)[number];
  order: number;
  tags: string[];
  outcomes: string[];
  audience: string;
  prerequisiteIds: string[];
  instructors: { name: string; title: string }[];
  unlockPolicy: UnlockPolicy;
  stats: { lessonCount: number; requiredLessonCount: number; totalDurationSec: number };
  contentVersion: number;
  source: "file" | "admin";
  updatedAt: string;
}
export interface LearnerCounts {
  active: number;
  completed: number;
  withdrawn: number;
  locked: number;
}
export type CourseRow = Course & { categoryName?: string; learners: LearnerCounts };
export interface Section {
  id: string;
  courseId: string;
  order: number;
  title: string;
  summary?: string;
}
export interface Lesson {
  id: string;
  courseId: string;
  sectionId: string;
  order: number;
  slug: string;
  title: string;
  summary: string;
  kind: (typeof LESSON_KINDS)[number];
  status: "draft" | "published";
  required: boolean;
  isPreview: boolean;
  video?: { provider: "youtube"; videoId: string; durationSec: number };
  body: Block[];
  transcript?: { language: (typeof LANGUAGES)[number]; paragraphs: string[] };
  resources: { title: string; url: string; kind: "link" | "download" }[];
}
export interface CourseView {
  course: Course;
  category?: string;
  sections: Section[];
  lessons: Lesson[];
  learners: LearnerCounts;
}

export interface EnrolmentRow {
  id: string;
  userId: string;
  courseId: string;
  status: string;
  access: { state: string; via?: string };
  enrolledAt: string;
  completedAt?: string;
  lastActivityAt?: string;
  course: string;
  user: Person;
}

export interface AuditRow {
  id: string;
  at: string;
  actorId?: string;
  actorName: string | null;
  action: string;
  outcome: "success" | "failure";
  requestId: string;
  ipPrefix: string;
  meta?: {
    reason?: string;
    targetType?: string;
    targetId?: string;
    detail?: string;
    courseSlug?: string;
  };
}

export interface PlatformSettings {
  referral: {
    enabled: boolean;
    threshold: number;
    experiment: { enabled: boolean; thresholds: number[] };
    maxQualifiedPerNetwork: number;
    maxNewPerCodePerDay: number;
    blockedEmailDomains: string[];
  };
  registration: { open: boolean };
  announcement: { enabled: boolean; message: string };
}
export interface StoredSettings {
  settings: PlatformSettings;
  version: number;
  updatedAt?: string;
  updatedBy?: string;
}

// ---------------------------------------------------------------- pure helpers

type QueryValue = string | number | boolean | null | undefined;

/** Builds "?a=1&b=2", leaving out empty, null and undefined values (so filters can stay in component state). */
export function qs(params: Record<string, QueryValue> = {}): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text === "") continue;
    out.set(key, text);
  }
  const text = out.toString();
  return text === "" ? "" : `?${text}`;
}

const BASE_URL: string = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";

export type ExportKind = "leads" | "users" | "referrals" | "enrolments";

/** Which filters each export honours on the server (anything else would be ignored, so it is dropped here). */
const EXPORT_FILTERS: Record<ExportKind, readonly string[]> = {
  leads: ["status", "kind", "from", "to", "q"],
  users: [],
  referrals: [],
  enrolments: [],
};

export function exportUrl(kind: ExportKind, filters: Record<string, QueryValue> = {}): string {
  const allowed = Object.fromEntries(
    Object.entries(filters).filter(([k]) => EXPORT_FILTERS[kind].includes(k)),
  );
  return `${BASE_URL}/api/v1/admin/export/${kind}${qs(allowed)}`;
}

export function isGateFailure(failure: ApiFailure): boolean {
  return (
    failure.reason === "rejected" &&
    (failure.code === "MFA_REQUIRED" || failure.code === "MFA_SETUP_REQUIRED")
  );
}

const CODE_TEXT: Record<string, string> = {
  LAST_ADMIN: "There must always be at least one admin.",
  SLUG_TAKEN: "That web address name is already used. Choose another.",
  NOT_PUBLISHABLE: "This item cannot be published yet. See what is missing below.",
  STALE_SETTINGS: "Someone else changed the settings. Reload to see their changes, then try again.",
  SECTION_NOT_EMPTY: "Move or retire this section's lessons first.",
  CONFLICT: "That change conflicts with the current state. Reload and try again.",
  NOT_FOUND: "That item no longer exists.",
  INVALID_CODE: "That code is not right.",
  MFA_REQUIRED: "Please confirm your second factor to continue.",
  MFA_SETUP_REQUIRED: "Set up two-step verification to continue.",
  REGISTRATION_CLOSED: "Registration is closed.",
};

/** Human wording for any failed call. Never shows raw server text. */
export function failureMessage(failure: ApiFailure): string {
  switch (failure.reason) {
    case "validation":
      return failure.problems.length > 0
        ? failure.problems.map((p) => (p.path ? `${p.path}: ${p.message}` : p.message)).join("; ")
        : "Some of the values are not valid. Check the form and try again.";
    case "rejected": {
      const text = CODE_TEXT[failure.code];
      if (text !== undefined) return text;
      if (failure.status === 409) return CODE_TEXT["CONFLICT"] ?? "Conflict.";
      if (failure.status === 404) return CODE_TEXT["NOT_FOUND"] ?? "Not found.";
      return "The request was refused. Please check it and try again.";
    }
    case "unauthenticated":
      return "Your session has ended. Please sign in again.";
    case "forbidden":
      return "You are not allowed to do that.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "network":
      return "We could not reach the server. Check your connection and try again.";
    case "invalid_credentials":
    case "account_not_active":
    case "invalid_token":
      return "That did not work. Please try again.";
    default:
      return "Something went wrong on our side. Please try again.";
  }
}

/** Detail lines for a 422 NOT_PUBLISHABLE (or a validation problem list). */
export function failureProblems(failure: ApiFailure): string[] {
  if (failure.reason === "rejected" || failure.reason === "validation")
    return failure.problems.map((p) => p.message);
  return [];
}

export interface DiffLine {
  path: string;
  from: string;
  to: string;
}

const show = (v: unknown): string =>
  Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : String(v);

/** Flat before/after lines for the "review your changes" step. Arrays are compared whole and summarised. */
export function diffSettings(before: unknown, after: unknown, path = ""): DiffLine[] {
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before ?? []) === JSON.stringify(after ?? [])
      ? []
      : [{ path, from: show(before ?? []), to: show(after ?? []) }];
  }
  if (
    typeof before === "object" &&
    before !== null &&
    typeof after === "object" &&
    after !== null
  ) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((k) =>
      diffSettings(
        (before as Record<string, unknown>)[k],
        (after as Record<string, unknown>)[k],
        path === "" ? k : `${path}.${k}`,
      ),
    );
  }
  return before === after ? [] : [{ path, from: show(before), to: show(after) }];
}

/** Moves an item one step; out-of-range moves return the same order. Never mutates. */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (moved !== undefined) next.splice(target, 0, moved);
  return next;
}

export function emptyBlock(type: BlockType): Block {
  switch (type) {
    case "heading":
    case "paragraph":
      return { type, text: "" };
    case "list":
      return { type, ordered: false, items: [""] };
    case "note":
      return { type, tone: "tip", text: "" };
    case "code":
      return { type, language: "", text: "" };
  }
}

/** Trims text, drops empty blocks/items and optional keys the API would reject when empty. */
export function cleanBlocks(blocks: readonly Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.type === "list") {
      const items = block.items.map((i) => i.trim()).filter((i) => i !== "");
      if (items.length > 0)
        out.push({ type: "list", items, ...(block.ordered ? { ordered: true } : {}) });
    } else if (block.type === "code") {
      const text = block.text.replace(/\s+$/, "");
      const language = (block.language ?? "").trim();
      if (text !== "") out.push({ type: "code", text, ...(language ? { language } : {}) });
    } else if (block.type === "note") {
      const text = block.text.trim();
      if (text !== "")
        out.push({ type: "note", text, ...(block.tone ? { tone: block.tone } : {}) });
    } else {
      const text = block.text.trim();
      if (text !== "") out.push({ type: block.type, text });
    }
  }
  return out;
}

export interface LayoutEntry {
  lessonId: string;
  sectionId: string;
}

/** Reading order the API expects: sections by order, lessons by their course order within each. */
export function buildLayout(
  sections: readonly Pick<Section, "id" | "order">[],
  lessons: readonly Pick<Lesson, "id" | "sectionId" | "order">[],
): LayoutEntry[] {
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .flatMap((s) =>
      lessons
        .filter((l) => l.sectionId === s.id)
        .sort((a, b) => a.order - b.order)
        .map((l) => ({ lessonId: l.id, sectionId: s.id })),
    );
}

/** Swaps a lesson with its neighbour inside the same section. */
export function moveLesson(
  layout: readonly LayoutEntry[],
  lessonId: string,
  direction: -1 | 1,
): LayoutEntry[] {
  const index = layout.findIndex((e) => e.lessonId === lessonId);
  const entry = layout[index];
  if (entry === undefined) return [...layout];
  const neighbour = layout[index + direction];
  if (neighbour === undefined || neighbour.sectionId !== entry.sectionId) return [...layout];
  return moveItem(layout, index, direction);
}

/** Moves a lesson to the end of another section, keeping everything else in place. */
export function moveLessonToSection(
  layout: readonly LayoutEntry[],
  sections: readonly Pick<Section, "id" | "order">[],
  lessonId: string,
  sectionId: string,
): LayoutEntry[] {
  const rest = layout.filter((e) => e.lessonId !== lessonId);
  const grouped = [...sections]
    .sort((a, b) => a.order - b.order)
    .flatMap((s) => {
      const own = rest.filter((e) => e.sectionId === s.id);
      return s.id === sectionId ? [...own, { lessonId, sectionId }] : own;
    });
  return grouped;
}

export const parseList = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\n,]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t !== ""),
  ),
];

/** "2026-11-20" from the date input becomes an end-of-day ISO instant; empty means "clear". */
export function dateToIso(value: string): string | null {
  if (value === "") return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export const isoToDateInput = (iso?: string | null): string => (iso ? iso.slice(0, 10) : "");

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m ${sec % 60}s`;
}

export function formatDate(iso?: string | null, withTime = false): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return withTime
    ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleDateString("en-GB", { dateStyle: "medium" });
}

export const isOverdue = (iso: string | undefined, now = Date.now()): boolean =>
  iso !== undefined && new Date(iso).getTime() < now;

export const humanize = (key: string): string =>
  key.replace(/[_.:-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const personLabel = (p: Person): string => p.displayName ?? p.email ?? p.id;

export const AUDIT_ACTIONS = [
  "auth.login.success",
  "auth.login.failure",
  "auth.session.reuse_detected",
  "auth.password_reset.complete",
  "user.export",
  "user.delete",
  "course.enrol",
  "course.complete",
  "referral.attributed",
  "referral.qualified",
  "referral.rejected",
  "referral.revoked",
  "referral.approved",
  "access.unlocked",
  "access.revoked",
  "code.redeem",
  "admin.mfa.setup",
  "admin.mfa.enable",
  "admin.mfa.verify",
  "admin.mfa.recovery_used",
  "admin.mfa.reset",
  "admin.user.roles",
  "admin.user.suspend",
  "admin.user.unsuspend",
  "admin.user.sessions_revoked",
  "admin.course.create",
  "admin.course.update",
  "admin.lesson.create",
  "admin.lesson.update",
  "admin.category.update",
  "admin.lead.update",
  "admin.lead.delete",
  "admin.unlock_code.create",
  "admin.unlock_code.update",
  "admin.enrolment.access",
  "admin.settings.update",
  "admin.export",
] as const;

export const ENROLMENT_STATUSES = ["active", "completed", "withdrawn"] as const;

/** URL-safe name from a title: lower-case words joined by hyphens, at most 80 characters. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const isSlug = (value: string): boolean =>
  value.length >= 2 && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** Accepts a bare 11-character id or a youtube.com / youtu.be link and returns the id, or null. */
export function extractYouTubeId(input: string): string | null {
  const text = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "");
    const candidate =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : host.endsWith("youtube.com") || host === "youtube-nocookie.com"
          ? (url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1) ?? "")
          : "";
    return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** "1:30", "90", "1:02:03" or "90s" to seconds; null when not understood or out of the API's 1 s to 4 h range. */
export function parseDuration(input: string): number | null {
  const text = input.trim().replace(/s$/i, "");
  if (text === "") return null;
  const parts = text.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d{1,5}$/.test(p))) return null;
  const sec = parts.reduce((total, p) => total * 60 + Number(p), 0);
  return sec >= 1 && sec <= 14_400 ? sec : null;
}

/** Client-side mirror of the server's settings limits, so problems are shown beside the field. */
export function settingsIssues(s: PlatformSettings): Record<string, string> {
  const out: Record<string, string> = {};
  const int = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  const r = s.referral;
  if (!int(r.threshold, 1, 50)) out["threshold"] = "Use a whole number from 1 to 50.";
  if (!int(r.maxQualifiedPerNetwork, 1, 50)) out["network"] = "Use a whole number from 1 to 50.";
  if (!int(r.maxNewPerCodePerDay, 1, 500)) out["velocity"] = "Use a whole number from 1 to 500.";
  const t = r.experiment.thresholds;
  if (t.length < 2 || t.length > 4) out["experiment"] = "Use between 2 and 4 different numbers.";
  else if (t.some((n) => !int(n, 1, 50))) out["experiment"] = "Each number must be 1 to 50.";
  else if (new Set(t).size !== t.length) out["experiment"] = "The numbers must be different.";
  if (r.blockedEmailDomains.some((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))
    out["domains"] = "Each domain looks like example.com.";
  if (r.blockedEmailDomains.length > 500) out["domains"] = "At most 500 domains.";
  if (s.announcement.message.length > 200) out["announcement"] = "At most 200 characters.";
  if (s.announcement.enabled && s.announcement.message.trim() === "")
    out["announcement"] = "Write the message, or switch the banner off.";
  return out;
}

// ---------------------------------------------------------------- requests and hooks

export class AdminError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failureMessage(failure));
    this.name = "AdminError";
  }
}

export const META_KEY = ["admin", "meta"] as const;

type Params = Record<string, QueryValue>;

/** Typed GET/POST/PUT/PATCH/DELETE against /api/v1/admin. */
export const adminApi = {
  get: <T>(path: string, params?: Params) => request<T>("GET", `/admin${path}${qs(params)}`),
  post: <T>(path: string, body?: unknown) => request<T>("POST", `/admin${path}`, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", `/admin${path}`, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", `/admin${path}`, body),
  del: <T = undefined>(path: string) => request<T>("DELETE", `/admin${path}`),
};

/** Server data for a page. Gate failures (second factor needed again) send the console back to its gate. */
export function useAdminQuery<T>(path: string, params?: Params, enabled = true) {
  const client = useQueryClient();
  const query = useQuery<T, AdminError>({
    queryKey: ["admin", path, params ?? {}],
    enabled: enabled && typeof window !== "undefined",
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const result = await adminApi.get<T>(path, params);
      if (!result.ok) throw new AdminError(result);
      return result.data;
    },
  });
  const failure = query.error?.failure;
  useEffect(() => {
    if (failure !== undefined && isGateFailure(failure))
      void client.invalidateQueries({ queryKey: META_KEY });
  }, [failure, client]);
  return query;
}

export interface ActionOptions {
  /** Toast text on success. */
  success?: string;
  /** Query path prefixes to refresh, e.g. ["/users"]. Defaults to everything under admin. */
  refresh?: string[];
}

/**
 * Runs a mutation and reports the outcome: toast on success or failure, refresh of the listed
 * queries, and a return of the failure so forms can show field-level problems.
 */
export function useAdminAction() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (call: () => Promise<ApiResult<unknown>>) => call(),
  });
  const run = async <T>(
    call: () => Promise<ApiResult<T>>,
    options: ActionOptions = {},
  ): Promise<ApiResult<T>> => {
    const result = (await mutation.mutateAsync(call)) as ApiResult<T>;
    if (result.ok) {
      if (options.success) toast.success(options.success);
      const prefixes = options.refresh;
      await client.invalidateQueries({
        predicate: (q) => {
          const [root, path] = q.queryKey as [string, string?];
          if (root !== "admin" || path === "meta") return false;
          return prefixes === undefined || prefixes.some((p) => (path ?? "").startsWith(p));
        },
      });
    } else {
      if (isGateFailure(result)) void client.invalidateQueries({ queryKey: META_KEY });
      else toast.error(failureMessage(result));
    }
    return result;
  };
  return { run, busy: mutation.isPending };
}

/** The console's own identity, permissions and menu. */
export function useAdminMeta() {
  return useQuery<AdminMeta, AdminError>({
    queryKey: META_KEY,
    enabled: typeof window !== "undefined",
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const result = await adminApi.get<AdminMeta>("/meta");
      if (!result.ok) throw new AdminError(result);
      return result.data;
    },
  });
}
