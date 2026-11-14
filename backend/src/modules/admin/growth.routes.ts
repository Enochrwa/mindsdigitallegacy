import { Router } from "express";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { AppError, notFound } from "../../core/errors.js";
import { UNLOCK_CODE_KINDS } from "../access/access.types.js";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "../leads/leads.model.js";
import { LEAD_KINDS } from "../leads/leads.schema.js";
import { REFERRAL_STATUSES, REJECT_REASONS } from "../referrals/referrals.types.js";
import { actorOf } from "./admin.context.js";
import type { AdminDeps, StaffGuards } from "./admin.context.js";
import { adminUserDto, isoDate, objectIdLike, pageQuery } from "./admin.shared.js";

const leadQuery = z.strictObject({
  ...pageQuery,
  q: z.string().trim().max(100).optional(),
  kind: z.enum(LEAD_KINDS).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assignedTo: z.string().trim().max(40).optional(),
  tag: z.string().trim().max(30).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  overdue: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "oldest", "followUp"]).optional(),
});
const leadPatch = z.strictObject({
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assignedTo: objectIdLike.nullable().optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).optional(),
  followUpAt: isoDate.nullable().optional(),
});

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeUnlockCode = (): string =>
  Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

export function createGrowthAdminRouter(deps: AdminDeps, guards: StaffGuards): Router {
  const router = Router();
  const idOf = (v: unknown): string => objectIdLike.parse(v);

  // ============ Leads (CRM pipeline) ============
  router.get("/leads", ...guards.with("leads:read"), async (req, res) => {
    const q = leadQuery.parse(req.query);
    const page = await deps.leads.list({ ...q, overdue: q.overdue === "true", now: deps.now() });
    res.json({
      ...page,
      items: page.items.map(({ notes, ...lead }) => ({ ...lead, noteCount: notes.length })),
      counts: await deps.leads.countByStatus(),
      overdue: await deps.leads.overdueCount(deps.now()),
    });
  });

  router.get("/leads/:id", ...guards.with("leads:read"), async (req, res) => {
    const lead = await deps.leads.findById(idOf(req.params["id"]));
    if (lead === null) throw notFound();
    const staff = await Promise.all(
      [
        ...new Set(lead.notes.map((n) => n.by).concat(lead.assignedTo ? [lead.assignedTo] : [])),
      ].map((id) => deps.users.findById(id)),
    );
    const names = Object.fromEntries(
      staff.filter((u) => u !== null).map((u) => [u.id, u.displayName]),
    );
    res.json({ lead, staffNames: names });
  });

  router.patch("/leads/:id", ...guards.with("leads:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const patch = leadPatch.parse(req.body);
    if (patch.assignedTo) {
      const assignee = await deps.users.findById(patch.assignedTo);
      if (assignee === null || !assignee.roles.some((r) => r === "admin" || r === "support"))
        throw new AppError(400, "VALIDATION_ERROR", "Assign leads to a staff member.");
    }
    const updated = await deps.leads.update(idOf(req.params["id"]), patch, deps.now());
    if (updated === null) throw notFound();
    await actor.record("admin.lead.update", {
      targetType: "lead",
      targetId: updated.id,
      detail: Object.keys(patch).join(","),
    });
    res.json({ lead: updated });
  });

  router.post("/leads/:id/notes", ...guards.with("leads:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const { text } = z.strictObject({ text: z.string().trim().min(1).max(2000) }).parse(req.body);
    const note = await deps.leads.addNote(idOf(req.params["id"]), actor.user.id, text, deps.now());
    if (note === null) throw notFound();
    await actor.record("admin.lead.update", {
      targetType: "lead",
      targetId: idOf(req.params["id"]),
      detail: "note added",
    });
    res.status(201).json({ note });
  });

  /** Deleting a lead is the "erase me" path for people who ask us to remove their request. Admin only. */
  router.delete("/leads/:id", ...guards.with("leads:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    if (!(await deps.leads.remove(idOf(req.params["id"])))) throw notFound();
    await actor.record("admin.lead.delete", {
      targetType: "lead",
      targetId: idOf(req.params["id"]),
    });
    res.status(204).end();
  });

  // ============ Referrals ============
  const refQuery = z.strictObject({
    ...pageQuery,
    status: z.enum(REFERRAL_STATUSES).optional(),
    reason: z.enum(REJECT_REASONS).optional(),
    referrerId: objectIdLike.optional(),
  });
  router.get("/referrals", ...guards.with("referrals:read"), async (req, res) => {
    const page = await deps.referrals.list(refQuery.parse(req.query));
    const ids = [...new Set(page.items.flatMap((r) => [r.referrerId, r.inviteeId]))];
    const people = new Map(
      (await Promise.all(ids.map((id) => deps.users.findById(id))))
        .filter((u) => u !== null)
        .map((u) => [u.id, u]),
    );
    const who = (id: string) =>
      people.get(id)
        ? { id, displayName: people.get(id)?.displayName, email: people.get(id)?.email }
        : { id };
    res.json({
      ...page,
      items: page.items.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        code: r.code,
        referrer: who(r.referrerId),
        invitee: who(r.inviteeId),
        network: r.ipPrefix,
        createdAt: r.createdAt,
        qualifiedAt: r.qualifiedAt,
        reviewedAt: r.reviewedAt,
      })),
      queue: (await deps.referrals.list({ page: 1, pageSize: 1, status: "needs_review" })).total,
    });
  });
  router.post("/referrals/:id/approve", ...guards.with("referrals:review"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    await deps.referralService.approve(idOf(req.params["id"]), actor.user.id, actor.ctx);
    res.status(204).end();
  });
  router.post("/referrals/:id/reject", ...guards.with("referrals:review"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    await deps.referralService.reject(idOf(req.params["id"]), actor.user.id, actor.ctx);
    res.status(204).end();
  });
  router.get("/referral-codes", ...guards.with("referrals:read"), async (req, res) => {
    const q = z
      .strictObject({ ...pageQuery, q: z.string().trim().max(12).optional() })
      .parse(req.query);
    const page = await deps.referrals.listCodes(q);
    const owners = new Map(
      (await Promise.all(page.items.map((c) => deps.users.findById(c.userId))))
        .filter((u) => u !== null)
        .map((u) => [u.id, u]),
    );
    const counts = await Promise.all(page.items.map((c) => deps.referrals.countByStatus(c.userId)));
    res.json({
      ...page,
      items: page.items.map((c, i) => ({
        ...c,
        owner: owners.get(c.userId)
          ? {
              id: c.userId,
              displayName: owners.get(c.userId)?.displayName,
              email: owners.get(c.userId)?.email,
            }
          : { id: c.userId },
        counts: counts[i],
      })),
    });
  });
  router.post(
    "/referral-codes/:id/status",
    ...guards.with("referrals:review"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const { status } = z.strictObject({ status: z.enum(["active", "disabled"]) }).parse(req.body);
      await deps.referralService.setCodeStatus(idOf(req.params["id"]), status);
      await actor.record("referral.revoked", {
        targetType: "referral_code",
        targetId: idOf(req.params["id"]),
        detail: `code ${status}`,
      });
      res.status(204).end();
    },
  );

  // ============ Unlock codes (ambassadors, partners, promotions) ============
  const codeBody = z.strictObject({
    kind: z.enum(UNLOCK_CODE_KINDS),
    label: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4,24}$/)
      .optional(),
    maxUses: z.number().int().min(1).max(100_000).nullable(),
    expiresAt: isoDate.nullable().optional(),
    courseSlugs: z.array(z.string().trim().max(80)).max(50).default([]),
  });
  router.get("/unlock-codes", ...guards.with("referrals:read"), async (req, res) => {
    const q = z
      .strictObject({ ...pageQuery, q: z.string().trim().max(24).optional() })
      .parse(req.query);
    res.json(await deps.unlockCodes.list(q));
  });
  router.post("/unlock-codes", ...guards.with("unlock:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const b = codeBody.parse(req.body);
    const courseIds: string[] = [];
    for (const s of b.courseSlugs) {
      const c = await deps.catalogue.findCourseBySlug(s);
      if (c === null) throw new AppError(400, "VALIDATION_ERROR", `Unknown course: ${s}`);
      courseIds.push(c.id);
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await deps.unlockCodes.create({
          code: b.code ?? makeUnlockCode(),
          kind: b.kind,
          label: b.label,
          maxUses: b.maxUses,
          expiresAt: b.expiresAt ?? undefined,
          status: "active",
          courseIds,
          createdBy: actor.user.id,
          now: deps.now(),
        });
        await actor.record("admin.unlock_code.create", {
          targetType: "unlock_code",
          targetId: created.id,
          detail: `${b.kind}: ${b.label}`,
        });
        res.status(201).json({ code: created });
        return;
      } catch (e) {
        if (
          !(e instanceof Error) ||
          (e.message !== "CODE_TAKEN" && !("code" in e && e.code === 11000)) ||
          b.code !== undefined
        )
          throw e;
      }
    }
    throw new AppError(500, "INTERNAL", "Something went wrong on our side.");
  });
  router.patch("/unlock-codes/:id", ...guards.with("unlock:manage"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const b = z
      .strictObject({
        label: z.string().trim().min(2).max(120).optional(),
        maxUses: z.number().int().min(1).max(100_000).nullable().optional(),
        expiresAt: isoDate.nullable().optional(),
        status: z.enum(["active", "disabled"]).optional(),
      })
      .parse(req.body);
    const id = idOf(req.params["id"]);
    if ((await deps.unlockCodes.findById(id)) === null) throw notFound();
    await deps.unlockCodes.update(id, { ...b, expiresAt: b.expiresAt ?? undefined });
    await actor.record("admin.unlock_code.update", {
      targetType: "unlock_code",
      targetId: id,
      detail: Object.keys(b).join(","),
    });
    res.json({ code: await deps.unlockCodes.findById(id) });
  });
  router.get(
    "/unlock-codes/:id/redemptions",
    ...guards.with("referrals:read"),
    async (req, res) => {
      const rows = await deps.unlockCodes.listRedemptions(idOf(req.params["id"]));
      const people = await Promise.all(rows.map((r) => deps.users.findById(r.userId)));
      res.json({
        items: rows.map((r, i) => ({
          at: r.at,
          user: people[i]
            ? { id: r.userId, displayName: people[i]?.displayName, email: people[i]?.email }
            : { id: r.userId },
        })),
      });
    },
  );

  // ============ Enrolments ============
  const enrolQuery = z.strictObject({
    ...pageQuery,
    courseId: objectIdLike.optional(),
    userId: objectIdLike.optional(),
    status: z.enum(["active", "completed", "withdrawn"]).optional(),
    accessState: z.enum(["locked", "unlocked"]).optional(),
  });
  router.get("/enrolments", ...guards.with("enrolments:read"), async (req, res) => {
    const page = await deps.enrolments.list(enrolQuery.parse(req.query));
    const [courses, people] = await Promise.all([
      deps.catalogue.findCoursesByIds([...new Set(page.items.map((e) => e.courseId))]),
      Promise.all(
        [...new Set(page.items.map((e) => e.userId))].map((id) => deps.users.findById(id)),
      ),
    ]);
    const byUser = new Map(people.filter((u) => u !== null).map((u) => [u.id, u]));
    res.json({
      ...page,
      items: page.items.map((e) => ({
        ...e,
        course: courses.find((c) => c.id === e.courseId)?.title ?? "(removed)",
        user: byUser.get(e.userId)
          ? {
              id: e.userId,
              displayName: byUser.get(e.userId)?.displayName,
              email: byUser.get(e.userId)?.email,
            }
          : { id: e.userId },
      })),
    });
  });

  void adminUserDto;
  return router;
}
