import { Router } from "express";
import { z } from "zod";
import { AppError, notFound } from "../../core/errors.js";
import { ROLES } from "../users/users.types.js";
import type { Role } from "../users/users.types.js";
import { actorOf } from "./admin.context.js";
import type { AdminDeps, StaffGuards } from "./admin.context.js";
import { adminUserDto, flag, objectIdLike, pageQuery } from "./admin.shared.js";

const listQuery = z.strictObject({
  ...pageQuery,
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(["active", "unverified", "suspended", "deleted"]).optional(),
});
const rolesBody = z.strictObject({ roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length) });
const suspendBody = z.strictObject({ reason: z.string().trim().min(3).max(200) });
const accessBody = z.strictObject({
  scope: z.union([z.literal("all"), z.strictObject({ courseSlug: z.string().trim().max(80) })]),
  note: z.string().trim().max(300).optional(),
});

export function createUsersAdminRouter(deps: AdminDeps, guards: StaffGuards): Router {
  const router = Router();
  const { users, sessions } = deps;

  async function target(id: string) {
    const user = await users.findById(objectIdLike.parse(id)).catch(() => null);
    if (user === null) throw notFound();
    return user;
  }
  /** Removing admin from the last admin would lock everyone out of the console. */
  const guardLastAdmin = async (user: { roles: Role[] }): Promise<void> => {
    if (user.roles.includes("admin") && (await users.countWithRole("admin")) <= 1) {
      throw new AppError(409, "LAST_ADMIN", "There must always be at least one admin.");
    }
  };

  router.get("/users", ...guards.with("users:read"), async (req, res) => {
    const q = listQuery.parse(req.query);
    const page = await users.list({
      page: q.page,
      pageSize: q.pageSize,
      q: q.q,
      role: q.role,
      status: q.status,
    });
    res.json({ ...page, items: page.items.map(adminUserDto) });
  });

  router.get("/users/:id", ...guards.with("users:read"), async (req, res) => {
    const user = await target(String(req.params["id"]));
    const [enrolments, entitlements, referral, code, events] = await Promise.all([
      deps.enrolments.listForUser(user.id),
      deps.access.listForUser(user.id),
      deps.referrals.countByStatus(user.id),
      deps.referrals.findCodeByUser(user.id),
      Promise.all([
        deps.audit.list({ actorId: user.id, page: 1, pageSize: 15 }),
        deps.audit.list({ targetId: user.id, page: 1, pageSize: 15 }),
      ]),
    ]);
    const courses = await deps.catalogue.findCoursesByIds(enrolments.map((e) => e.courseId));
    const invitedBy = await deps.referrals.findByInvitee(user.id);
    const recent = [...events[0].items, ...events[1].items]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 20);
    res.json({
      user: adminUserDto(user),
      enrolments: enrolments.map((e) => ({
        courseSlug: courses.find((c) => c.id === e.courseId)?.slug ?? "(removed)",
        courseTitle: courses.find((c) => c.id === e.courseId)?.title ?? "(removed course)",
        status: e.status,
        access: e.access.state,
        via: e.access.via,
        enrolledAt: e.enrolledAt,
        completedAt: e.completedAt,
        lastActivityAt: e.lastActivityAt,
      })),
      entitlements: entitlements.map((e) => ({
        id: e.id,
        scope:
          e.scope.type === "all"
            ? "all"
            : (courses.find((c) => c.id === (e.scope as { courseId: string }).courseId)?.slug ??
              "course"),
        via: e.via,
        note: e.note,
        grantedAt: e.grantedAt,
        grantedBy: e.grantedBy,
        revokedAt: e.revokedAt,
      })),
      referral: {
        code: code?.code,
        codeStatus: code?.status,
        assignedThreshold: code?.assignedThreshold,
        counts: referral,
        invitedBy:
          invitedBy === null
            ? null
            : {
                referrerId: invitedBy.referrerId,
                status: invitedBy.status,
                reason: invitedBy.reason,
              },
      },
      activity: recent.map((e) => ({
        at: e.at,
        action: e.action,
        outcome: e.outcome,
        actorId: e.actorId,
        detail: e.meta?.detail,
        targetId: e.meta?.targetId,
      })),
    });
  });

  router.put("/users/:id/roles", ...guards.with("roles:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const user = await target(String(req.params["id"]));
    if (user.id === actor.user.id)
      throw new AppError(409, "CONFLICT", "You cannot change your own roles.");
    const roles = [...new Set<Role>(["learner", ...rolesBody.parse(req.body).roles])];
    if (!roles.includes("admin")) await guardLastAdmin(user);
    await users.setRoles(user.id, roles);
    // Roles change what a session may do, so existing sessions start over.
    await sessions.revokeAllForUser(user.id);
    await actor.record("admin.user.roles", {
      targetType: "user",
      targetId: user.id,
      detail: `${user.roles.join(",")} -> ${roles.join(",")}`,
    });
    res.json({ user: adminUserDto((await users.findById(user.id)) ?? user) });
  });

  router.post("/users/:id/suspend", ...guards.with("users:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const user = await target(String(req.params["id"]));
    if (user.id === actor.user.id)
      throw new AppError(409, "CONFLICT", "You cannot suspend yourself.");
    await guardLastAdmin(user);
    const { reason } = suspendBody.parse(req.body);
    await users.setSuspended(user.id, deps.now(), reason);
    await sessions.revokeAllForUser(user.id);
    await actor.record("admin.user.suspend", { targetType: "user", targetId: user.id, reason });
    res.status(204).end();
  });

  router.post("/users/:id/unsuspend", ...guards.with("users:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const user = await target(String(req.params["id"]));
    await users.setSuspended(user.id, undefined);
    await users.clearLoginState(user.id);
    await actor.record("admin.user.unsuspend", { targetType: "user", targetId: user.id });
    res.status(204).end();
  });

  router.post("/users/:id/revoke-sessions", ...guards.with("users:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const user = await target(String(req.params["id"]));
    await sessions.revokeAllForUser(user.id);
    await actor.record("admin.user.sessions_revoked", { targetType: "user", targetId: user.id });
    res.status(204).end();
  });

  /** For a colleague who lost their phone and recovery codes. They must set up again at next sign-in. */
  router.post("/users/:id/mfa-reset", ...guards.with("roles:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const user = await target(String(req.params["id"]));
    if (user.id === actor.user.id)
      throw new AppError(
        409,
        "CONFLICT",
        "Use your recovery codes to regain access to your own account.",
      );
    await users.setTotp(user.id, undefined);
    await sessions.revokeAllForUser(user.id);
    await actor.record("admin.mfa.reset", { targetType: "user", targetId: user.id });
    res.status(204).end();
  });

  /** Gives a learner access to gated courses (a scholarship, a partner cohort, a mistake to put right). */
  router.post("/users/:id/access", ...guards.with("enrolments:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const user = await target(String(req.params["id"]));
    const body = accessBody.parse(req.body);
    let scope: { type: "all" } | { type: "course"; courseId: string } = { type: "all" };
    if (body.scope !== "all") {
      const course = await deps.catalogue.findCourseBySlug(body.scope.courseSlug);
      if (course === null) throw new AppError(404, "NOT_FOUND", "Course not found.");
      scope = { type: "course", courseId: course.id };
    }
    await deps.access.grant(user.id, scope, "admin", {
      grantedBy: actor.user.id,
      note: body.note,
      ctx: actor.ctx,
    });
    await actor.record("admin.enrolment.access", {
      targetType: "user",
      targetId: user.id,
      detail: `grant ${body.scope === "all" ? "all" : body.scope.courseSlug}`,
    });
    res.status(204).end();
  });

  router.delete("/entitlements/:id", ...guards.with("enrolments:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    await deps.access.revokeEntitlement(
      objectIdLike.parse(req.params["id"]),
      actor.user.id,
      actor.ctx,
    );
    res.status(204).end();
  });

  void flag;
  return router;
}
