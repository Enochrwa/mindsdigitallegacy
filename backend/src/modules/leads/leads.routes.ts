import { Router } from "express";
import type { RequestHandler } from "express";
import { leadInputSchema } from "./leads.schema.js";
import type { LeadService } from "./leads.service.js";

interface Deps {
  service: LeadService;
  limiter: RequestHandler;
}

/** POST /api/v1/leads: public, unauthenticated, strictly validated and rate limited. */
export function createLeadsRouter({ service, limiter }: Deps): Router {
  const router = Router();

  router.post("/", limiter, async (req, res) => {
    // A ZodError thrown here reaches the central error handler as a 400.
    const input = leadInputSchema.parse(req.body);
    await service.submit(input);
    res.status(201).json({ status: "received" });
  });

  return router;
}
