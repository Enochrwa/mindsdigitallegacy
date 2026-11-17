import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import { memoryAudit } from "../../testing/memory.js";
import { createPurgeService, schedule } from "./purge.js";
import type { PurgeStore } from "./purge.js";

const silent = pino({ level: "silent" });
const DAY = 86_400_000;
const NOW = new Date("2026-12-01T10:00:00Z");

/** A fake store holding soft-deleted accounts with their deletion dates. */
function fakeStore(deleted: Record<string, Date>, failFor: string[] = []) {
  const purged: string[] = [];
  const store: PurgeStore = {
    findDeletedBefore(cutoff, limit) {
      const ids = Object.entries(deleted)
        .filter(([id, at]) => at <= cutoff && !purged.includes(id))
        .sort((a, b) => a[1].getTime() - b[1].getTime())
        .map(([id]) => id)
        .slice(0, limit);
      return Promise.resolve(ids);
    },
    purgeUser(id) {
      if (failFor.includes(id)) return Promise.reject(new Error("boom"));
      purged.push(id);
      return Promise.resolve({ users: 1, sessions: 2 });
    },
  };
  return { store, purged };
}

describe("account purge", () => {
  it("purges only accounts whose grace period has ended", async () => {
    const { store, purged } = fakeStore({
      old: new Date(NOW.getTime() - 31 * DAY),
      edge: new Date(NOW.getTime() - 30 * DAY),
      recent: new Date(NOW.getTime() - 29 * DAY),
    });
    const audit = memoryAudit();
    const service = createPurgeService({
      store,
      audit,
      logger: silent,
      graceDays: 30,
      now: () => NOW,
    });

    const result = await service.run();

    expect(purged.sort()).toEqual(["edge", "old"]);
    expect(result).toMatchObject({ purged: 2, failed: 0, counts: { users: 2, sessions: 4 } });
  });

  it("writes one audit event per account with the id and no personal data", async () => {
    const { store } = fakeStore({ u1: new Date(NOW.getTime() - 40 * DAY) });
    const audit = memoryAudit();
    await createPurgeService({
      store,
      audit,
      logger: silent,
      graceDays: 30,
      now: () => NOW,
    }).run();

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "system.account.purge",
      outcome: "success",
      meta: { targetType: "user", targetId: "u1" },
    });
    expect(JSON.stringify(audit.events[0])).not.toMatch(/@/);
  });

  it("is idempotent: a second run finds nothing to do", async () => {
    const { store } = fakeStore({ u1: new Date(NOW.getTime() - 40 * DAY) });
    const service = createPurgeService({
      store,
      audit: memoryAudit(),
      logger: silent,
      graceDays: 30,
      now: () => NOW,
    });
    expect((await service.run()).purged).toBe(1);
    expect(await service.run()).toEqual({ purged: 0, failed: 0, counts: {} });
  });

  it("keeps going when one account fails, reports it, and retries it next run", async () => {
    const deleted = {
      a: new Date(NOW.getTime() - 50 * DAY),
      b: new Date(NOW.getTime() - 40 * DAY),
    };
    const failing = fakeStore(deleted, ["a"]);
    const audit = memoryAudit();
    const first = await createPurgeService({
      store: failing.store,
      audit,
      logger: silent,
      graceDays: 30,
      now: () => NOW,
    }).run();

    expect(first).toMatchObject({ purged: 1, failed: 1 });
    expect(failing.purged).toEqual(["b"]);
    // Only the account that really was purged is audited.
    expect(audit.events.map((e) => e.meta?.targetId)).toEqual(["b"]);

    const retry = fakeStore({ a: deleted.a });
    const second = await createPurgeService({
      store: retry.store,
      audit,
      logger: silent,
      graceDays: 30,
      now: () => NOW,
    }).run();
    expect(second.purged).toBe(1);
  });

  it("respects the batch size so one run cannot hold the database for long", async () => {
    const deleted = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`u${String(i)}`, new Date(NOW.getTime() - 60 * DAY)]),
    );
    const { store, purged } = fakeStore(deleted);
    const service = createPurgeService({
      store,
      audit: memoryAudit(),
      logger: silent,
      graceDays: 30,
      batchSize: 2,
      now: () => NOW,
    });
    expect((await service.run()).purged).toBe(2);
    expect(purged).toHaveLength(2);
  });
});

describe("schedule", () => {
  it("skips a tick while the previous run is still going and survives errors", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      let release: () => void = () => undefined;
      const task = vi.fn(() => {
        calls += 1;
        if (calls === 1) return new Promise<void>((resolve) => (release = resolve));
        return Promise.reject(new Error("fails"));
      });
      const handle = schedule(task, 1000, silent);

      await vi.advanceTimersByTimeAsync(3000); // ticks 2 and 3 are skipped: run 1 is unfinished
      expect(task).toHaveBeenCalledTimes(1);

      release();
      await vi.advanceTimersByTimeAsync(1000); // run 2 rejects; the timer keeps going
      await vi.advanceTimersByTimeAsync(1000);
      expect(task.mock.calls.length).toBeGreaterThanOrEqual(3);

      handle.stop();
      const before = task.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(task).toHaveBeenCalledTimes(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
