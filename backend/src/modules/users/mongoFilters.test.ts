import mongoose from "mongoose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { hasWrappedOperator, sanitizedFilter } from "../../testing/mongoFilters.js";
import { AuthTokenModel } from "../auth/authTokens.js";
import { createMongoAuthTokenRepository } from "../auth/authTokens.mongo.js";
import { SessionModel } from "../sessions/sessions.model.js";
import { createMongoSessionRepository } from "../sessions/sessions.mongo.js";

/**
 * Regression for a production-only bug: the connection enables `sanitizeFilter`, which rewrites untrusted
 * operators into `$eq` so lookups silently match nothing. In-memory fakes cannot catch that, so these tests
 * capture the real filter each Mongo repository builds and pass it through Mongoose's sanitiser.
 */
beforeAll(() => {
  mongoose.set("sanitizeFilter", true);
});

describe("Mongo repositories keep their operators under sanitizeFilter", () => {
  it("detects the failure mode (sanity check of the helper)", () => {
    const bad = sanitizedFilter(AuthTokenModel as never, { expiresAt: { $gt: new Date() } });
    expect(hasWrappedOperator(bad)).toBe(true);
  });

  it("token consume and peek", async () => {
    const consume = vi
      .spyOn(AuthTokenModel, "findOneAndUpdate")
      .mockReturnValue({ lean: () => Promise.resolve(null) } as never);
    const find = vi
      .spyOn(AuthTokenModel, "findOne")
      .mockReturnValue({ lean: () => Promise.resolve(null) } as never);
    const repo = createMongoAuthTokenRepository();
    await repo.consume("reset_password", "h", new Date());
    await repo.peek("reset_password", "h", new Date());
    for (const call of [consume.mock.calls[0]?.[0], find.mock.calls[0]?.[0]]) {
      const filter = sanitizedFilter(
        AuthTokenModel as never,
        call as unknown as Record<string, unknown>,
      );
      expect(hasWrappedOperator(filter)).toBe(false);
      expect(JSON.stringify(filter)).toContain("$gt");
      expect(JSON.stringify(filter)).toContain("$exists");
    }
  });

  it("revoking all other sessions", async () => {
    const del = vi
      .spyOn(SessionModel, "deleteMany")
      .mockResolvedValue({ deletedCount: 0, acknowledged: true });
    await createMongoSessionRepository().revokeAllForUser(
      new mongoose.Types.ObjectId().toString(),
      "family-1",
    );
    const filter = sanitizedFilter(
      SessionModel as never,
      del.mock.calls[0]?.[0] as unknown as Record<string, unknown>,
    );
    expect(hasWrappedOperator(filter)).toBe(false);
    expect(JSON.stringify(filter)).toContain("$ne");
  });
});
