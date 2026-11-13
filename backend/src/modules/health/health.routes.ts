import { Router } from "express";

interface Deps {
  isDbReady: () => boolean;
}

/**
 * Liveness (`/health`) says the process is up. Readiness (`/ready`) says it can serve traffic
 * (database connected). Neither reveals versions, uptime or dependency details, which would help
 * an attacker fingerprint the service.
 */
export function createHealthRouter({ isDbReady }: Deps): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  router.get("/ready", (_req, res) => {
    if (isDbReady()) {
      res.status(200).json({ status: "ready" });
    } else {
      res.status(503).json({ status: "unavailable" });
    }
  });

  return router;
}
