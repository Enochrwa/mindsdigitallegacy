import { createApp } from "./app.js";
import { ConfigError, loadEnv } from "./config/env.js";
import { createLogger } from "./core/logger.js";
import { closeDb, connectDb, isDbReady } from "./db/connect.js";
import { createMongoLeadRepository } from "./modules/leads/leads.repository.js";

const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);

  if (env.MONGODB_URI === undefined) {
    logger.warn("MONGODB_URI is not set; running without a database (/ready will report 503)");
  } else {
    await connectDb(env.MONGODB_URI);
    logger.info("database connected");
  }

  const app = createApp({
    env,
    logger,
    leadRepository: createMongoLeadRepository(),
    isDbReady,
  });

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: env.PORT, nodeEnv: env.NODE_ENV }, "api listening");
  });

  // Slow-client and slowloris protection.
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    const force = setTimeout(() => {
      logger.error("forced shutdown after grace period");
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    force.unref();
    server.close(() => {
      closeDb()
        .catch((err: unknown) => logger.error({ err }, "error closing database"))
        .finally(() => process.exit(0));
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // A process in an unknown state must not keep serving requests. Let the supervisor restart it.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandled rejection");
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception");
    process.exit(1);
  });
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    process.stderr.write(`${err.message}\n`);
  } else {
    process.stderr.write(`Failed to start: ${err instanceof Error ? err.message : "unknown"}\n`);
  }
  process.exit(1);
});
