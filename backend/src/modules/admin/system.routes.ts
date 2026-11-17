import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../core/errors.js";
import { authLocals } from "../auth/auth.middleware.js";
import { can, permissionsOf } from "../auth/permissions.js";
import type { Permission } from "../auth/permissions.js";
import { settingsSchema } from "../settings/settings.js";
import { LEAD_STATUSES } from "../leads/leads.model.js";
import { LEAD_KINDS } from "../leads/leads.schema.js";
import { MFA_FRESH_MS, actorOf } from "./admin.context.js";
import type { AdminDeps, StaffGuards } from "./admin.context.js";
import { diffObjects, isoDate, objectIdLike, pageQuery, toCsv } from "./admin.shared.js";

/**
 * The console's navigation, owned by the server. A section appears for a person only when they hold
 * its permission, and adding a module later (internships, payments) is one entry here plus its routes:
 * the web app builds its menu from this list instead of hard-coding it.
 */
export const ADMIN_MODULES: readonly {
  key: string;
  label: string;
  path: string;
  permission: Permission;
  group: string;
}[] = [
  {
    key: "overview",
    label: "Overview",
    path: "/admin",
    permission: "analytics:read",
    group: "Insights",
  },
  { key: "leads", label: "Leads", path: "/admin/leads", permission: "leads:read", group: "Growth" },
  {
    key: "internships",
    label: "Internships",
    path: "/admin/internships",
    permission: "internships:read",
    group: "Growth",
  },
  {
    key: "referrals",
    label: "Referrals",
    path: "/admin/referrals",
    permission: "referrals:read",
    group: "Growth",
  },
  {
    key: "unlock-codes",
    label: "Unlock codes",
    path: "/admin/unlock-codes",
    permission: "referrals:read",
    group: "Growth",
  },
  {
    key: "courses",
    label: "Courses",
    path: "/admin/courses",
    permission: "courses:read",
    group: "Academy",
  },
  {
    key: "enrolments",
    label: "Enrolments",
    path: "/admin/enrolments",
    permission: "enrolments:read",
    group: "Academy",
  },
  { key: "users", label: "Users", path: "/admin/users", permission: "users:read", group: "People" },
  {
    key: "audit",
    label: "Audit log",
    path: "/admin/audit",
    permission: "audit:read",
    group: "System",
  },
  {
    key: "settings",
    label: "Settings",
    path: "/admin/settings",
    permission: "settings:read",
    group: "System",
  },
  {
    key: "security",
    label: "My security",
    path: "/admin/security",
    permission: "admin:access",
    group: "System",
  },
];

const DAY = 24 * 60 * 60 * 1000;
const auditQuery = z.strictObject({
  ...pageQuery,
  action: z.string().trim().max(60).optional(),
  actorId: objectIdLike.optional(),
  targetId: objectIdLike.optional(),
  outcome: z.enum(["success", "failure"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export function createSystemAdminRouter(deps: AdminDeps, guards: StaffGuards): Router {
  const router = Router();

  /** Who am I and what may I see? Works before the second factor is passed, so the app can show the right screen. */
  router.get("/meta", ...guards.session, (_req, res) => {
    const { user, mfaVerifiedAt } = authLocals(res);
    const permissions = permissionsOf(user.roles);
    const enabled = user.totp?.enabledAt !== undefined;
    const verified =
      enabled &&
      mfaVerifiedAt !== undefined &&
      deps.now().getTime() - mfaVerifiedAt.getTime() <= MFA_FRESH_MS;
    res.json({
      user: { id: user.id, email: user.email, displayName: user.displayName, roles: user.roles },
      mfa: { enabled, verified, recoveryCodesLeft: user.totp?.recoveryHashes.length ?? 0 },
      permissions: verified ? [...permissions] : [],
      modules: verified ? ADMIN_MODULES.filter((m) => permissions.has(m.permission)) : [],
    });
  });

  // ============ Overview & analytics ============
  router.get("/overview", ...guards.with("analytics:read"), async (req, res) => {
    const { days } = z
      .strictObject({ days: z.coerce.number().int().min(7).max(365).default(30) })
      .parse(req.query);
    const since = new Date(deps.now().getTime() - days * DAY);
    const [
      users,
      leadsByStatus,
      leadsByKind,
      overdue,
      funnel,
      queue,
      courseCounts,
      enrolStats,
      signups,
      enrolSeries,
      leadSeries,
      qualifiedSeries,
      courses,
    ] = await Promise.all([
      deps.users.countAll(),
      deps.leads.countByStatus(),
      deps.leads.countByKind(),
      deps.leads.overdueCount(deps.now()),
      deps.referrals.funnel(since),
      deps.referrals.list({ page: 1, pageSize: 1, status: "needs_review" }),
      deps.catalogueAdmin.countCourses(),
      deps.enrolments.statsByCourse(),
      deps.users.signupsByDay(since),
      deps.enrolments.enrolmentsByDay(since),
      deps.leads.byDay(since),
      deps.referrals.eventsByDay(since, "qualified"),
      deps.catalogueAdmin.listCourses({ page: 1, pageSize: 100 }),
    ]);
    const perCourse = courses.items.map((c) => {
      const s = enrolStats[c.id] ?? { active: 0, completed: 0, withdrawn: 0, locked: 0 };
      const started = s.active + s.completed;
      return {
        slug: c.slug,
        title: c.title,
        status: c.status,
        ...s,
        completionRate: started === 0 ? 0 : Math.round((s.completed / started) * 100),
      };
    });
    res.json({
      days,
      users,
      leads: { byStatus: leadsByStatus, byKind: leadsByKind, overdueFollowUps: overdue },
      referrals: {
        funnel,
        reviewQueue: queue.total,
        qualificationRate: funnel.byType.attributed
          ? Math.round(((funnel.byType.qualified ?? 0) / funnel.byType.attributed) * 100)
          : 0,
      },
      courses: {
        byStatus: courseCounts,
        perCourse: perCourse.sort((a, b) => b.active + b.completed - (a.active + a.completed)),
      },
      series: {
        signups,
        enrolments: enrolSeries,
        leads: leadSeries,
        qualifiedReferrals: qualifiedSeries,
      },
    });
  });

  // ============ Settings ============
  router.get("/settings", ...guards.with("settings:read"), async (_req, res) => {
    res.json(await deps.settings.get());
  });
  router.put("/settings", ...guards.with("settings:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const body = z
      .strictObject({ settings: settingsSchema, version: z.number().int().min(0) })
      .parse(req.body);
    const t = body.settings.referral.experiment.thresholds;
    if (new Set(t).size !== t.length)
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Experiment thresholds must be different from each other.",
      );
    const before = await deps.settings.get();
    if (!(await deps.settings.save(body.settings, body.version, actor.user.id, deps.now()))) {
      throw new AppError(
        409,
        "STALE_SETTINGS",
        "Someone else changed the settings. Reload and try again.",
      );
    }
    const changes = diffObjects(before.settings, body.settings);
    await actor.record("admin.settings.update", {
      targetType: "settings",
      targetId: "platform",
      detail: changes.join("; ").slice(0, 500) || "no change",
    });
    res.json(await deps.settings.get());
  });

  // ============ Audit log ============
  router.get("/audit", ...guards.with("audit:read"), async (req, res) => {
    const page = await deps.audit.list(auditQuery.parse(req.query));
    const ids = [
      ...new Set(page.items.map((e) => e.actorId).filter((v): v is string => v !== undefined)),
    ];
    const people = new Map(
      (await Promise.all(ids.map((id) => deps.users.findById(id))))
        .filter((u) => u !== null)
        .map((u) => [u.id, u.displayName]),
    );
    res.json({
      ...page,
      items: page.items.map((e) => ({
        ...e,
        actorName: e.actorId ? (people.get(e.actorId) ?? null) : null,
      })),
    });
  });

  // ============ CSV exports ============
  router.get("/export/:kind", ...guards.with("export:data"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const kind = z.enum(["leads", "users", "referrals", "enrolments"]).parse(req.params["kind"]);
    const LIMIT = 5000;
    const needs: Record<typeof kind, Permission> = {
      leads: "leads:read",
      users: "users:read",
      referrals: "referrals:read",
      enrolments: "enrolments:read",
    };
    if (!can(actor.user.roles, needs[kind]))
      throw new AppError(403, "FORBIDDEN", "You are not allowed to do that.");
    let csv: string;
    if (kind === "leads") {
      const q = z
        .object({
          status: z.enum(LEAD_STATUSES).optional(),
          kind: z.enum(LEAD_KINDS).optional(),
          from: isoDate.optional(),
          to: isoDate.optional(),
          q: z.string().max(100).optional(),
        })
        .parse(req.query);
      const rows = await deps.leads.exportRows(q, LIMIT);
      csv = toCsv(
        [
          "id",
          "received",
          "kind",
          "status",
          "priority",
          "name",
          "email",
          "phone",
          "organization",
          "service",
          "budget",
          "interest",
          "tags",
          "follow_up",
          "message",
        ],
        rows.map((l) => [
          l.id,
          l.createdAt,
          l.kind,
          l.status,
          l.priority,
          l.fullName,
          l.email,
          l.phone,
          l.organization,
          l.service,
          l.budget,
          l.interest,
          l.tags.join(" "),
          l.followUpAt,
          l.message,
        ]),
      );
    } else if (kind === "users") {
      const page = await deps.users.list({ page: 1, pageSize: LIMIT });
      csv = toCsv(
        ["id", "created", "email", "name", "roles", "verified", "age_bracket"],
        page.items.map((u) => [
          u.id,
          u.createdAt,
          u.email,
          u.displayName,
          u.roles.join(" "),
          u.emailVerifiedAt !== undefined,
          u.ageBracket,
        ]),
      );
    } else if (kind === "referrals") {
      const rows = (await deps.referrals.list({ page: 1, pageSize: LIMIT })).items;
      csv = toCsv(
        ["id", "created", "status", "reason", "code", "referrer_id", "invitee_id", "network"],
        rows.map((r) => [
          r.id,
          r.createdAt,
          r.status,
          r.reason,
          r.code,
          r.referrerId,
          r.inviteeId,
          r.ipPrefix,
        ]),
      );
    } else {
      const rows = (await deps.enrolments.list({ page: 1, pageSize: LIMIT })).items;
      csv = toCsv(
        ["id", "enrolled", "status", "access", "via", "user_id", "course_id", "completed"],
        rows.map((e) => [
          e.id,
          e.enrolledAt,
          e.status,
          e.access.state,
          e.access.via,
          e.userId,
          e.courseId,
          e.completedAt,
        ]),
      );
    }
    await actor.record("admin.export", {
      targetType: kind,
      detail: `${csv.split("\r\n").length - 2} rows`,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="mdl-${kind}-${deps.now().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  });

  void permissionsOf;
  return router;
}
