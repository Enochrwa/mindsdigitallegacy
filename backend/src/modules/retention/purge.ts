import type { Logger } from "../../core/logger.js";
import type { AuditLog } from "../audit/audit.js";

/** How many rows were removed or anonymised for one account, by collection. Counts only, no content. */
export type PurgeCounts = Record<string, number>;

/**
 * Persistence port for the purge job. `purgeUser` must be idempotent: running it twice for the same
 * user (after a crash half way) finishes the work and never fails because something is already gone.
 * The user row is removed last, so a half-finished purge is still found by `findDeletedBefore`.
 */
export interface PurgeStore {
  /** Ids of accounts soft-deleted at or before `cutoff`, oldest first, at most `limit`. */
  findDeletedBefore(cutoff: Date, limit: number): Promise<string[]>;
  purgeUser(userId: string): Promise<PurgeCounts>;
}

export interface PurgeResult {
  purged: number;
  failed: number;
  /** Totals by collection across all accounts purged in this run. */
  counts: PurgeCounts;
}

export interface PurgeServiceDeps {
  store: PurgeStore;
  audit: AuditLog;
  logger: Logger;
  /** Days between deletion and permanent removal. A grace period lets support undo a mistaken deletion. */
  graceDays: number;
  batchSize?: number;
  now?: () => Date;
}

const DAY_MS = 86_400_000;

export function createPurgeService(deps: PurgeServiceDeps) {
  const { store, audit, logger, graceDays } = deps;
  const batchSize = deps.batchSize ?? 100;
  const now = deps.now ?? ((): Date => new Date());

  /**
   * Removes every account whose grace period has ended. One failing account never blocks the others:
   * it is logged and retried on the next run. The audit event names the account id only (never an
   * email); audit rows written earlier for that id are kept as the security record (docs/07).
   */
  async function run(): Promise<PurgeResult> {
    const cutoff = new Date(now().getTime() - graceDays * DAY_MS);
    const ids = await store.findDeletedBefore(cutoff, batchSize);
    const result: PurgeResult = { purged: 0, failed: 0, counts: {} };

    for (const id of ids) {
      try {
        const counts = await store.purgeUser(id);
        for (const [name, n] of Object.entries(counts)) {
          result.counts[name] = (result.counts[name] ?? 0) + n;
        }
        await audit.append({
          at: now(),
          action: "system.account.purge",
          requestId: "system:purge",
          ipPrefix: "system",
          outcome: "success",
          meta: { targetType: "user", targetId: id, detail: `graceDays=${String(graceDays)}` },
        });
        result.purged += 1;
      } catch (err) {
        result.failed += 1;
        logger.error({ err, userId: id }, "account purge failed; will retry on the next run");
      }
    }

    if (ids.length > 0) {
      logger.info({ purged: result.purged, failed: result.failed }, "account purge finished");
    }
    return result;
  }

  return { run };
}

export type PurgeService = ReturnType<typeof createPurgeService>;

/**
 * Runs `task` on a timer. A run that is still going when the next tick fires is skipped, errors are
 * logged and never crash the process, and the timer does not keep the process alive on shutdown.
 * Safe with more than one API instance because `purgeUser` is idempotent.
 */
export function schedule(
  task: () => Promise<unknown>,
  everyMs: number,
  logger: Logger,
): { stop(): void } {
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    task()
      .catch((err: unknown) => logger.error({ err }, "scheduled task failed"))
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return {
    stop: () => clearInterval(timer),
  };
}
