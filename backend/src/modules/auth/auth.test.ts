import request from "supertest";
import { describe, expect, it } from "vitest";
import { ALLOWED_ORIGIN, buildTestApp, errorOf } from "../../testing/fixtures.js";

const PASSWORD = "correct horse battery";
const HEADER = { "X-Requested-With": "mdl-web" };

const registration = {
  email: "ada@example.rw",
  password: PASSWORD,
  displayName: "Ada Uwase",
  ageBracket: "16_plus",
  consent: true,
  privacyNoticeVersion: "2026-11",
} as const;

const breachedList = new Set(["a breached passphrase"]);
const breach = { isBreached: (p: string) => Promise.resolve(breachedList.has(p)) };

function setup(opts: { now?: () => Date; env?: Record<string, string> } = {}) {
  const ctx = buildTestApp({
    breach,
    env: { RATE_LIMIT_AUTH_PER_15MIN: "1000", ...opts.env },
    ...(opts.now === undefined ? {} : { now: opts.now }),
  });
  const api = request(ctx.app);
  const tokenOf = (kind: string, to?: string): string => {
    const mail = ctx.mailer.sent
      .filter((m) => m.kind === kind && (to === undefined || m.to === to))
      .at(-1);
    if (mail?.token === undefined) throw new Error(`no ${kind} mail`);
    return mail.token;
  };
  const register = (body: Record<string, unknown> = {}) =>
    api.post("/api/v1/auth/register").send({ ...registration, ...body });
  const verify = async (email = registration.email) =>
    api.post("/api/v1/auth/verify-email").send({ token: tokenOf("verify", email) });
  const login = (body: Record<string, unknown> = {}) =>
    api.post("/api/v1/auth/login").send({ email: registration.email, password: PASSWORD, ...body });
  const cookieOf = (res: { headers: Record<string, unknown> }): string => {
    const raw = res.headers["set-cookie"] as string[] | undefined;
    const first = raw?.[0];
    if (first === undefined) throw new Error("no cookie");
    return first.split(";")[0] ?? "";
  };
  const signedIn = async (): Promise<string> => {
    await register();
    await verify();
    return cookieOf(await login());
  };
  return { ...ctx, api, tokenOf, register, verify, login, cookieOf, signedIn };
}

describe("registration", () => {
  it("returns the same generic answer for new and existing addresses (no enumeration)", async () => {
    const t = setup();
    const first = await t.register();
    const second = await t.register();
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body).toEqual(first.body);
    expect(t.users.all.size).toBe(1);
    expect(t.mailer.sent.map((m) => m.kind)).toEqual(["verify", "existing"]);
  });

  it("never stores or accepts client-chosen roles (mass assignment)", async () => {
    const t = setup();
    const res = await t.register({ roles: ["admin"] });
    expect(res.status).toBe(400);
    expect(t.users.all.size).toBe(0);
    await t.register();
    expect([...t.users.all.values()][0]?.roles).toEqual(["learner"]);
  });

  it("stores only a hash of the password", async () => {
    const t = setup();
    await t.register();
    const stored = [...t.users.all.values()][0]?.passwordHash ?? "";
    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(stored).not.toContain(PASSWORD);
  });

  it("rejects weak passwords and missing consent", async () => {
    const t = setup();
    const weak = await t.register({ password: "short" });
    expect(weak.status).toBe(400);
    expect(errorOf(weak).code).toBe("VALIDATION_ERROR");
    expect((await t.register({ password: "password123" })).status).toBe(400);
    expect((await t.register({ consent: false })).status).toBe(400);
    expect(t.users.all.size).toBe(0);
  });

  it("requires a different guardian email for learners under 16", async () => {
    const t = setup();
    expect((await t.register({ ageBracket: "under_16" })).status).toBe(400);
    expect(
      (await t.register({ ageBracket: "under_16", guardianEmail: registration.email })).status,
    ).toBe(400);
    expect(
      (await t.register({ ageBracket: "under_16", guardianEmail: "parent@example.rw" })).status,
    ).toBe(202);
    expect(t.mailer.sent.map((m) => m.kind)).toEqual(["verify", "guardian"]);
  });

  it("records consent and an audit event without personal data", async () => {
    const t = setup();
    await t.register();
    expect([...t.users.all.values()][0]?.consents[0]).toMatchObject({
      type: "service",
      noticeVersion: "2026-11",
    });
    expect(JSON.stringify(t.audit.events)).not.toContain("ada@example.rw");
    expect(JSON.stringify(t.audit.events)).not.toContain(PASSWORD);
  });
});

describe("breached passwords", () => {
  it("rejects a breached password at registration and at reset", async () => {
    const t = setup();
    const res = await t.register({ password: "a breached passphrase" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("data breach");
    expect(t.users.all.size).toBe(0);

    await t.register();
    await t.verify();
    await t.api.post("/api/v1/auth/password/forgot").send({ email: registration.email });
    const token = t.tokenOf("reset");
    const bad = await t.api
      .post("/api/v1/auth/password/reset")
      .send({ token, password: "a breached passphrase" });
    expect(bad.status).toBe(400);
    // The link survives, so the person can pick another password.
    expect(
      (
        await t.api
          .post("/api/v1/auth/password/reset")
          .send({ token, password: "a clean long passphrase" })
      ).status,
    ).toBe(200);
  });
});

describe("resend verification", () => {
  it("sends a new link only to unverified accounts, with an identical answer for everyone", async () => {
    const t = setup();
    await t.register();
    const send = (email: string) => t.api.post("/api/v1/auth/verify-email/resend").send({ email });
    const known = await send(registration.email);
    const unknown = await send("nobody@example.rw");
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(t.mailer.sent.filter((m) => m.kind === "verify")).toHaveLength(2);
    await t.verify();
    await send(registration.email);
    expect(t.mailer.sent.filter((m) => m.kind === "verify")).toHaveLength(2);
  });
});

describe("email verification", () => {
  it("works once and only once", async () => {
    const t = setup();
    await t.register();
    const token = t.tokenOf("verify");
    expect((await t.api.post("/api/v1/auth/verify-email").send({ token })).status).toBe(200);
    const again = await t.api.post("/api/v1/auth/verify-email").send({ token });
    expect(again.status).toBe(400);
    expect(errorOf(again).code).toBe("INVALID_TOKEN");
  });

  it("rejects unknown and malformed tokens identically", async () => {
    const t = setup();
    const unknown = await t.api.post("/api/v1/auth/verify-email").send({ token: "a".repeat(43) });
    expect(unknown.status).toBe(400);
    expect((await t.api.post("/api/v1/auth/verify-email").send({ token: "x" })).status).toBe(400);
  });

  it("rejects an expired token", async () => {
    let now = Date.now();
    const t = setup({ now: () => new Date(now) });
    await t.register();
    now += 25 * 60 * 60 * 1000;
    expect((await t.verify()).status).toBe(400);
  });
});

describe("login", () => {
  it("refuses unverified accounts after proving the password", async () => {
    const t = setup();
    await t.register();
    const res = await t.login();
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("ACCOUNT_NOT_ACTIVE");
  });

  it("keeps under-16 accounts inactive until the guardian confirms", async () => {
    const t = setup();
    await t.register({ ageBracket: "under_16", guardianEmail: "parent@example.rw" });
    await t.verify();
    expect((await t.login()).status).toBe(403);
    const confirm = await t.api
      .post("/api/v1/auth/guardian/confirm")
      .send({ token: t.tokenOf("guardian", "parent@example.rw") });
    expect(confirm.status).toBe(200);
    expect((await t.login()).status).toBe(200);
  });

  it("sets a hardened session cookie and never returns the session id in the body", async () => {
    const t = setup();
    await t.register();
    await t.verify();
    const res = await t.login();
    expect(res.status).toBe(200);
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0] ?? "";
    expect(cookie).toMatch(/^mdl_sid=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(JSON.stringify(res.body)).not.toContain(t.cookieOf(res).split("=")[1] ?? "!");
  });

  it("uses a Secure __Host- cookie in production", async () => {
    const t = setup({
      env: {
        NODE_ENV: "production",
        MONGODB_URI: "mongodb://db.internal:27017/mdl",
        WEB_BASE_URL: ALLOWED_ORIGIN,
      },
    });
    await t.register();
    await t.verify();
    const cookie = ((await t.login()).headers["set-cookie"] as unknown as string[])[0] ?? "";
    expect(cookie).toMatch(/^__Host-mdl_sid=/);
    expect(cookie).toContain("Secure");
  });

  it("answers wrong password and unknown email identically", async () => {
    const t = setup();
    await t.register();
    await t.verify();
    const wrong = await t.login({ password: "not the password" });
    const unknown = await t.login({ email: "nobody@example.rw" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(errorOf(wrong).code).toBe(errorOf(unknown).code);
    expect(errorOf(wrong).message).toBe(errorOf(unknown).message);
  });

  it("locks after repeated failures, and the right password is refused with the same answer", async () => {
    const t = setup();
    await t.register();
    await t.verify();
    for (let i = 0; i < 5; i += 1) await t.login({ password: "wrong password!" });
    const locked = await t.login();
    expect(locked.status).toBe(401);
    expect(errorOf(locked).code).toBe("INVALID_CREDENTIALS");
  });

  it("unlocks after the backoff and resets the counter on success", async () => {
    let now = Date.now();
    const t = setup({ now: () => new Date(now) });
    await t.register();
    await t.verify();
    for (let i = 0; i < 5; i += 1) await t.login({ password: "wrong password!" });
    now += 60_000;
    expect((await t.login()).status).toBe(200);
    expect([...t.users.all.values()][0]?.failedLogins).toBe(0);
  });

  it("is rate limited per client", async () => {
    const t = setup({ env: { RATE_LIMIT_AUTH_PER_15MIN: "3" } });
    for (let i = 0; i < 3; i += 1) await t.login();
    expect((await t.login()).status).toBe(429);
  });
});

describe("authenticated requests", () => {
  it("rejects missing, malformed and unknown cookies the same way", async () => {
    const t = setup();
    const none = await t.api.get("/api/v1/users/me");
    const bad = await t.api.get("/api/v1/users/me").set("Cookie", "mdl_sid=short");
    const unknown = await t.api.get("/api/v1/users/me").set("Cookie", `mdl_sid=${"a".repeat(43)}`);
    for (const res of [none, bad, unknown]) {
      expect(res.status).toBe(401);
      expect(errorOf(res).code).toBe("UNAUTHENTICATED");
    }
  });

  it("returns only the public profile, never the hash or internals", async () => {
    const t = setup();
    const cookie = await t.signedIn();
    const res = await t.api.get("/api/v1/users/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("argon2");
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("failedLogins");
    expect((res.body as { user: { email: string } }).user.email).toBe("ada@example.rw");
  });

  it("stores only the hash of the session id", async () => {
    const t = setup();
    const cookie = await t.signedIn();
    const raw = cookie.split("=")[1] ?? "";
    const stored = [...t.sessions.all.values()][0];
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.tokenHash).not.toBe(raw);
  });

  it("requires the custom header on mutations (CSRF)", async () => {
    const t = setup();
    const cookie = await t.signedIn();
    const noHeader = await t.api.post("/api/v1/auth/logout").set("Cookie", cookie).send({});
    expect(noHeader.status).toBe(403);
    expect(errorOf(noHeader).code).toBe("CSRF_HEADER_REQUIRED");
    expect((await t.api.get("/api/v1/users/me").set("Cookie", cookie)).status).toBe(200);
  });

  it("logout revokes the session server-side", async () => {
    const t = setup();
    const cookie = await t.signedIn();
    const out = await t.api.post("/api/v1/auth/logout").set("Cookie", cookie).set(HEADER).send({});
    expect(out.status).toBe(204);
    expect(t.sessions.all.size).toBe(0);
    expect((await t.api.get("/api/v1/users/me").set("Cookie", cookie)).status).toBe(401);
  });
});

describe("session lifecycle", () => {
  it("expires after the idle period", async () => {
    let now = Date.now();
    const t = setup({ now: () => new Date(now) });
    const cookie = await t.signedIn();
    now += 31 * 24 * 60 * 60 * 1000;
    expect((await t.api.get("/api/v1/users/me").set("Cookie", cookie)).status).toBe(401);
  });

  it("rotates the session id after a day and keeps the user signed in", async () => {
    let now = Date.now();
    const t = setup({ now: () => new Date(now) });
    const old = await t.signedIn();
    now += 25 * 60 * 60 * 1000;
    const res = await t.api.get("/api/v1/users/me").set("Cookie", old);
    expect(res.status).toBe(200);
    const fresh = t.cookieOf(res);
    expect(fresh).not.toBe(old);
    expect((await t.api.get("/api/v1/users/me").set("Cookie", fresh)).status).toBe(200);
  });

  it("revokes the whole family when a rotated id is replayed after the grace period", async () => {
    let now = Date.now();
    const t = setup({ now: () => new Date(now) });
    const old = await t.signedIn();
    now += 25 * 60 * 60 * 1000;
    const fresh = t.cookieOf(await t.api.get("/api/v1/users/me").set("Cookie", old));
    now += 60_000;
    expect((await t.api.get("/api/v1/users/me").set("Cookie", old)).status).toBe(401);
    // The attacker's replay also killed the legitimate rotated session.
    expect((await t.api.get("/api/v1/users/me").set("Cookie", fresh)).status).toBe(401);
    expect(t.audit.events.some((e) => e.action === "auth.session.reuse_detected")).toBe(true);
  });

  it("tolerates a parallel request that still carries the old id inside the grace window", async () => {
    let now = Date.now();
    const t = setup({ now: () => new Date(now) });
    const old = await t.signedIn();
    now += 25 * 60 * 60 * 1000;
    await t.api.get("/api/v1/users/me").set("Cookie", old);
    now += 2_000;
    expect((await t.api.get("/api/v1/users/me").set("Cookie", old)).status).toBe(200);
  });
});

describe("password reset", () => {
  it("answers identically for known and unknown addresses and only mails real accounts", async () => {
    const t = setup();
    await t.register();
    await t.verify();
    const known = await t.api
      .post("/api/v1/auth/password/forgot")
      .send({ email: registration.email });
    const unknown = await t.api
      .post("/api/v1/auth/password/forgot")
      .send({ email: "nobody@example.rw" });
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(t.mailer.sent.filter((m) => m.kind === "reset")).toHaveLength(1);
  });

  it("sets a new password, revokes every session and works once", async () => {
    const t = setup();
    const cookie = await t.signedIn();
    await t.api.post("/api/v1/auth/password/forgot").send({ email: registration.email });
    const token = t.tokenOf("reset");
    const next = "a brand new passphrase";
    expect(
      (await t.api.post("/api/v1/auth/password/reset").send({ token, password: next })).status,
    ).toBe(200);
    expect((await t.api.get("/api/v1/users/me").set("Cookie", cookie)).status).toBe(401);
    expect((await t.login()).status).toBe(401);
    expect((await t.login({ password: next })).status).toBe(200);
    expect(
      (await t.api.post("/api/v1/auth/password/reset").send({ token, password: next })).status,
    ).toBe(400);
  });

  it("does not burn the link when the new password is rejected", async () => {
    const t = setup();
    await t.register();
    await t.verify();
    await t.api.post("/api/v1/auth/password/forgot").send({ email: registration.email });
    const token = t.tokenOf("reset");
    expect(
      (await t.api.post("/api/v1/auth/password/reset").send({ token, password: "password123" }))
        .status,
    ).toBe(400);
    expect(
      (
        await t.api
          .post("/api/v1/auth/password/reset")
          .send({ token, password: "a long enough passphrase" })
      ).status,
    ).toBe(200);
  });
});

describe("own-data endpoints", () => {
  it("records marketing consent separately and allows withdrawal", async () => {
    const t = setup();
    const cookie = await t.signedIn();
    const put = (granted: boolean) =>
      t.api
        .put("/api/v1/users/me/consents/marketing")
        .set("Cookie", cookie)
        .set(HEADER)
        .send({ granted, privacyNoticeVersion: "2026-11" });
    expect((await put(true)).status).toBe(204);
    expect((await put(false)).status).toBe(204);
    const consents = [...t.users.all.values()][0]?.consents ?? [];
    expect(consents.find((c) => c.type === "marketing")?.withdrawnAt).toBeInstanceOf(Date);
    expect(consents.find((c) => c.type === "service")?.withdrawnAt).toBeUndefined();
  });

  it("exports only the caller's own data", async () => {
    const t = setup();
    const cookie = await t.signedIn();
    await t.register({ email: "other@example.rw", displayName: "Other Person" });
    const res = await t.api.get("/api/v1/users/me/export").set("Cookie", cookie);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).toContain("ada@example.rw");
    expect(text).not.toContain("other@example.rw");
    expect(text).not.toContain("argon2");
  });

  it("deletes the account only with the password, then revokes sessions and blocks login", async () => {
    const t = setup();
    const cookie = await t.signedIn();
    const del = (password: string) =>
      t.api.delete("/api/v1/users/me").set("Cookie", cookie).set(HEADER).send({ password });
    expect((await del("wrong password!!")).status).toBe(401);
    expect((await t.api.get("/api/v1/users/me").set("Cookie", cookie)).status).toBe(200);
    expect((await del(PASSWORD)).status).toBe(204);
    expect((await t.api.get("/api/v1/users/me").set("Cookie", cookie)).status).toBe(401);
    expect((await t.login()).status).toBe(401);
  });
});
