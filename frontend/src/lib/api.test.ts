import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

type Init = { method: string; credentials: string; headers: Record<string, string>; body?: string };

function mockFetch(status: number, body?: unknown) {
  const fn = vi
    .fn()
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const initOf = (fn: ReturnType<typeof vi.fn>): Init => (fn.mock.calls[0] as [string, Init])[1];

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("sends credentials and the CSRF header on mutations only", async () => {
    const post = mockFetch(200, { status: "ok" });
    await api.auth.login("a@b.rw", "pw");
    expect(initOf(post).credentials).toBe("include");
    expect(initOf(post).headers["X-Requested-With"]).toBe("mdl-web");

    const get = mockFetch(200, { user: {} });
    await api.users.me();
    expect(initOf(get).headers["X-Requested-With"]).toBeUndefined();
  });

  it("never puts the password in the URL", async () => {
    const fn = mockFetch(200, {});
    await api.auth.login("a@b.rw", "secret-pass-123");
    expect(String(fn.mock.calls[0]?.[0])).not.toContain("secret");
  });

  it("maps error responses to a closed set of reasons", async () => {
    mockFetch(401, { error: { code: "INVALID_CREDENTIALS" } });
    expect(await api.auth.login("a", "b")).toEqual({ ok: false, reason: "invalid_credentials" });
    mockFetch(401, { error: { code: "UNAUTHENTICATED" } });
    expect(await api.users.me()).toEqual({ ok: false, reason: "unauthenticated" });
    mockFetch(403, { error: { code: "ACCOUNT_NOT_ACTIVE" } });
    expect(await api.auth.login("a", "b")).toEqual({ ok: false, reason: "account_not_active" });
    mockFetch(400, { error: { code: "INVALID_TOKEN" } });
    expect(await api.auth.verifyEmail("t")).toEqual({ ok: false, reason: "invalid_token" });
    mockFetch(429, { error: { code: "RATE_LIMITED" } });
    expect(await api.auth.login("a", "b")).toEqual({ ok: false, reason: "rate_limited" });
    mockFetch(500, { error: { code: "INTERNAL_ERROR", message: "stack trace here" } });
    expect(await api.auth.login("a", "b")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns validation problems as field paths and messages only", async () => {
    mockFetch(400, {
      error: {
        code: "VALIDATION_ERROR",
        details: [{ path: "password", message: "Too common" }, "junk", { path: 1 }],
      },
    });
    expect(
      await api.auth.register({
        email: "a@b.rw",
        password: "x",
        displayName: "A",
        ageBracket: "16_plus",
        consent: true,
        privacyNoticeVersion: "1",
      }),
    ).toEqual({
      ok: false,
      reason: "validation",
      problems: [{ path: "password", message: "Too common" }],
    });
  });

  it("reports network failures and handles 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await api.auth.logout()).toEqual({ ok: false, reason: "network" });
    mockFetch(204);
    expect(await api.auth.logout()).toEqual({ ok: true, data: undefined });
  });
});
