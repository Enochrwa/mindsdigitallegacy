import { Router } from "express";
import { AppError } from "../../core/errors.js";
import {
  adminApplicationDto,
  adminPlacementDto,
  adminPostingDto,
} from "../internships/internships.dto.js";
import {
  applicationQuery,
  bulkSchema,
  endPlacementSchema,
  idParam,
  interviewSchema,
  noteSchema,
  placeSchema,
  placementQuery,
  postingCreateSchema,
  postingPatchSchema,
  postingQuery,
  reassignSchema,
  transitionSchema,
} from "../internships/internships.schema.js";
import type { ApplicationStatus } from "../internships/internships.types.js";
import { can } from "../auth/permissions.js";
import { actorOf } from "./admin.context.js";
import type { AdminDeps, StaffGuards } from "./admin.context.js";
import { toCsv } from "./admin.shared.js";

/** Everything under /api/v1/admin/internships. Each route names the permission it needs. */
export function createInternshipsAdminRouter(deps: AdminDeps, guards: StaffGuards): Router {
  const router = Router();
  const svc = deps.internships;

  async function namesOf(ids: string[]): Promise<Record<string, string>> {
    const users = await Promise.all([...new Set(ids)].map((id) => deps.users.findById(id)));
    return Object.fromEntries(users.filter((u) => u !== null).map((u) => [u.id, u.displayName]));
  }

  // ---------------------------------------------------------------- overview
  router.get("/internships/stats", ...guards.with("internships:read"), async (_req, res) => {
    res.json(await svc.stats());
  });

  router.get("/internships/supervisors", ...guards.with("internships:read"), async (_req, res) => {
    const rows = await svc.supervisorsWithLoad();
    res.json({
      items: rows.map((r) => ({
        id: r.user.id,
        displayName: r.user.displayName,
        email: r.user.email,
        active: r.active,
        capacity: r.capacity,
        available: Math.max(0, r.capacity - r.active),
      })),
    });
  });

  // ---------------------------------------------------------------- postings
  router.get("/internships/postings", ...guards.with("internships:read"), async (req, res) => {
    const page = await svc.listPostings(postingQuery.parse(req.query));
    const names = await namesOf(page.items.flatMap((p) => p.supervisorIds));
    res.json({ ...page, items: page.items.map((p) => adminPostingDto(p, names)) });
  });

  router.post("/internships/postings", ...guards.with("internships:write"), async (req, res) => {
    const actor = actorOf(deps, req, res);
    const posting = await svc.createPosting(
      actor.user,
      postingCreateSchema.parse(req.body),
      actor.ctx,
    );
    res
      .status(201)
      .json({ posting: adminPostingDto(posting, await namesOf(posting.supervisorIds)) });
  });

  router.get("/internships/postings/:id", ...guards.with("internships:read"), async (req, res) => {
    const posting = await svc.getPosting(idParam.parse(req.params["id"]));
    res.json({ posting: adminPostingDto(posting, await namesOf(posting.supervisorIds)) });
  });

  router.patch(
    "/internships/postings/:id",
    ...guards.with("internships:write"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const posting = await svc.updatePosting(
        actor.user,
        idParam.parse(req.params["id"]),
        postingPatchSchema.parse(req.body),
        actor.ctx,
      );
      res.json({ posting: adminPostingDto(posting, await namesOf(posting.supervisorIds)) });
    },
  );

  /** A copy as a new draft, so the next cohort does not mean retyping everything. */
  router.post(
    "/internships/postings/:id/duplicate",
    ...guards.with("internships:write"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const copy = await svc.duplicatePosting(
        actor.user,
        idParam.parse(req.params["id"]),
        actor.ctx,
      );
      res.status(201).json({ posting: adminPostingDto(copy, await namesOf(copy.supervisorIds)) });
    },
  );

  router.post(
    "/internships/postings/:id/publish",
    ...guards.with("internships:write"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const posting = await svc.publishPosting(
        actor.user,
        idParam.parse(req.params["id"]),
        actor.ctx,
      );
      res.json({ posting: adminPostingDto(posting, await namesOf(posting.supervisorIds)) });
    },
  );

  router.post(
    "/internships/postings/:id/close",
    ...guards.with("internships:write"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const posting = await svc.closePosting(
        actor.user,
        idParam.parse(req.params["id"]),
        actor.ctx,
      );
      res.json({ posting: adminPostingDto(posting, await namesOf(posting.supervisorIds)) });
    },
  );

  // ------------------------------------------------------------ applications
  router.get("/internships/applications", ...guards.with("internships:read"), async (req, res) => {
    const { waitingDays, ...parsed } = applicationQuery.parse(req.query);
    const page = await svc.listApplications({
      ...parsed,
      // "Waiting more than N days" only makes sense for applications nobody has opened yet.
      ...(waitingDays === undefined
        ? {}
        : {
            status: "submitted" as const,
            createdBefore: new Date(deps.now().getTime() - waitingDays * 86_400_000),
          }),
    });
    const [postings, applicants] = await Promise.all([
      Promise.all(
        [...new Set(page.items.map((a) => a.postingId))].map((id) =>
          svc.getPosting(id).catch(() => null),
        ),
      ),
      Promise.all(
        [...new Set(page.items.map((a) => a.userId))].map((id) => deps.users.findById(id)),
      ),
    ]);
    const postingBy = new Map(postings.filter((p) => p !== null).map((p) => [p.id, p]));
    const userBy = new Map(applicants.filter((u) => u !== null).map((u) => [u.id, u]));
    res.json({
      ...page,
      items: page.items.map((a) =>
        adminApplicationDto(a, userBy.get(a.userId) ?? null, postingBy.get(a.postingId) ?? null),
      ),
    });
  });

  /** Registered before ":id" so "export.csv" is never read as an id. */
  router.get(
    "/internships/applications/export.csv",
    ...guards.with("export:data"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      if (!can(actor.user.roles, "internships:read")) {
        throw new AppError(403, "FORBIDDEN", "You are not allowed to do that.");
      }
      const page = await svc.listApplications({
        page: 1,
        pageSize: 100,
        ...applicationQuery.partial().parse(req.query),
      });
      const users = await Promise.all(page.items.map((a) => deps.users.findById(a.userId)));
      const csv = toCsv(
        ["applicationId", "postingId", "name", "email", "status", "under18", "createdAt"],
        page.items.map((a, i) => [
          a.id,
          a.postingId,
          users[i]?.displayName,
          users[i]?.email,
          a.status,
          a.under18,
          a.createdAt,
        ]),
      );
      await actor.record("admin.export", {
        targetType: "internship_applications",
        detail: `${String(page.items.length)} rows (first page of 100)`,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="mdl-internship-applications-${deps.now().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    },
  );

  router.get(
    "/internships/applications/:id",
    ...guards.with("internships:read"),
    async (req, res) => {
      const { application, posting, applicant, placement } = await svc.getApplication(
        idParam.parse(req.params["id"]),
      );
      const staff = await namesOf([
        ...application.notes.map((n) => n.by),
        ...application.events.map((e) => e.by).filter((b) => b !== "system"),
      ]);
      res.json({
        application: adminApplicationDto(application, applicant, posting),
        staffNames: staff,
        placement:
          placement === null ? null : adminPlacementDto(placement, { posting, intern: applicant }),
      });
    },
  );

  router.post(
    "/internships/applications/:id/transition",
    ...guards.with("internships:review"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const body = transitionSchema.parse(req.body);
      const updated = await svc.transition(
        actor.user,
        idParam.parse(req.params["id"]),
        body.to as ApplicationStatus,
        {
          note: body.note,
          message: body.message,
          interview: body.interview === undefined ? undefined : { ...body.interview },
        },
        actor.ctx,
      );
      const { applicant, posting } = await svc.getApplication(updated.id);
      res.json({ application: adminApplicationDto(updated, applicant, posting) });
    },
  );

  /** One decision for many applications (for example shortlisting the best matches). Each is checked on its own. */
  router.post(
    "/internships/applications/bulk-transition",
    ...guards.with("internships:review"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const body = bulkSchema.parse(req.body);
      const results = await svc.bulkTransition(
        actor.user,
        body.ids,
        body.to as ApplicationStatus,
        { message: body.message },
        actor.ctx,
      );
      res.json({
        results,
        done: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      });
    },
  );

  router.put(
    "/internships/applications/:id/interview",
    ...guards.with("internships:review"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const body = interviewSchema.parse(req.body);
      const updated = await svc.setInterview(
        actor.user,
        idParam.parse(req.params["id"]),
        { ...body },
        actor.ctx,
      );
      const { applicant, posting } = await svc.getApplication(updated.id);
      res.json({ application: adminApplicationDto(updated, applicant, posting) });
    },
  );

  router.post(
    "/internships/applications/:id/notes",
    ...guards.with("internships:review"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const body = noteSchema.parse(req.body);
      const updated = await svc.addNote(
        actor.user,
        idParam.parse(req.params["id"]),
        body.text,
        body.score,
        actor.ctx,
      );
      const { applicant, posting } = await svc.getApplication(updated.id);
      res.status(201).json({ application: adminApplicationDto(updated, applicant, posting) });
    },
  );

  router.post(
    "/internships/applications/:id/verify-guardian",
    ...guards.with("internships:place"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const updated = await svc.verifyGuardian(
        actor.user,
        idParam.parse(req.params["id"]),
        actor.ctx,
      );
      const { applicant, posting } = await svc.getApplication(updated.id);
      res.json({ application: adminApplicationDto(updated, applicant, posting) });
    },
  );

  router.post(
    "/internships/applications/:id/place",
    ...guards.with("internships:place"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const body = placeSchema.parse(req.body);
      const placement = await svc.place(
        actor.user,
        idParam.parse(req.params["id"]),
        body,
        actor.ctx,
      );
      const detail = await svc.getPlacement(placement.id);
      res.status(201).json({ placement: adminPlacementDto(detail.placement, detail) });
    },
  );

  // -------------------------------------------------------------- placements
  router.get("/internships/placements", ...guards.with("internships:read"), async (req, res) => {
    const page = await svc.listPlacements(placementQuery.parse(req.query));
    const details = await Promise.all(page.items.map((p) => svc.getPlacement(p.id)));
    res.json({ ...page, items: details.map((d) => adminPlacementDto(d.placement, d)) });
  });

  router.get(
    "/internships/placements/:id",
    ...guards.with("internships:read"),
    async (req, res) => {
      const d = await svc.getPlacement(idParam.parse(req.params["id"]));
      res.json({ placement: adminPlacementDto(d.placement, d) });
    },
  );

  router.post(
    "/internships/placements/:id/end",
    ...guards.with("internships:place"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const body = endPlacementSchema.parse(req.body);
      const ended = await svc.endPlacement(
        actor.user,
        idParam.parse(req.params["id"]),
        body.status,
        body.summary,
        actor.ctx,
      );
      const d = await svc.getPlacement(ended.id);
      res.json({ placement: adminPlacementDto(d.placement, d) });
    },
  );

  router.post(
    "/internships/placements/:id/supervisor",
    ...guards.with("internships:place"),
    async (req, res) => {
      const actor = actorOf(deps, req, res);
      const body = reassignSchema.parse(req.body);
      const updated = await svc.reassignSupervisor(
        actor.user,
        idParam.parse(req.params["id"]),
        body.supervisorId,
        actor.ctx,
      );
      const d = await svc.getPlacement(updated.id);
      res.json({ placement: adminPlacementDto(d.placement, d) });
    },
  );

  return router;
}
