/**
 * One-off or cron entry point: permanently removes accounts whose deletion grace period has ended.
 *
 *   npm run purge:accounts            # real run
 *   npm run purge:accounts -- --dry   # list how many accounts are due, change nothing
 *
 * Needs MONGODB_URI (and optionally ACCOUNT_PURGE_GRACE_DAYS). Safe to run repeatedly.
 */
import { ConfigError, loadEnv } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import { closeDb, connectDb } from "../db/connect.js";
import { createMongoAuditLog } from "../modules/audit/audit.js";
import { createPurgeService } from "../modules/retention/purge.js";
import { createMongoPurgeStore } from "../modules/retention/purge.mongo.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  if (env.MONGODB_URI === undefined) throw new ConfigError(["MONGODB_URI is required"]);
  await connectDb(env.MONGODB_URI);
  try {
    const store = createMongoPurgeStore();
    if (process.argv.includes("--dry")) {
      const cutoff = new Date(Date.now() - env.ACCOUNT_PURGE_GRACE_DAYS * 86_400_000);
      const due = await store.findDeletedBefore(cutoff, 1000);
      process.stdout.write(
        `${String(due.length)} account(s) are due for purge (showing at most 1000).\n`,
      );
      return;
    }
    const service = createPurgeService({
      store,
      audit: createMongoAuditLog(),
      logger,
      graceDays: env.ACCOUNT_PURGE_GRACE_DAYS,
    });
    const result = await service.run();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : "purge failed"}\n`);
  process.exit(1);
});
