import { Router } from "express";
import { createStaffGuards } from "./admin.context.js";
import type { AdminDeps } from "./admin.context.js";
import { createContentAdminRouter } from "./content.routes.js";
import { createGrowthAdminRouter } from "./growth.routes.js";
import { createMfaRouter } from "./mfa.routes.js";
import { createSystemAdminRouter } from "./system.routes.js";
import { createUsersAdminRouter } from "./users.routes.js";

/** Everything under /api/v1/admin. Each sub-router declares the permission every route needs. */
export function createAdminRouter(deps: AdminDeps): Router {
  const guards = createStaffGuards(deps);
  const router = Router();
  router.use(createMfaRouter(deps, guards));
  router.use(createSystemAdminRouter(deps, guards));
  router.use(createUsersAdminRouter(deps, guards));
  router.use(createContentAdminRouter(deps, guards));
  router.use(createGrowthAdminRouter(deps, guards));
  return router;
}
