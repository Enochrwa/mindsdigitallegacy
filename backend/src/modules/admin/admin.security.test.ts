import { describe, expect, it } from "vitest";
import { errorOf } from "../../testing/fixtures.js";
import { CSRF, harness } from "../../testing/harness.js";
import { can, permissionsOf, isStaff } from "../auth/permissions.js";

describe("staff access control", () => {
  it("rejects anonymous and learner sessions", async () => {
    const t = harness();
    expect((await t.api.get("/api/v1/admin/meta")).status).toBe(401);
    const learner = await t.learner("l@example.rw");
    const res = await t.api.get("/api/v1/admin/meta").set("Cookie", learner.cookie);
    expect(res.status).toBe(403);
    expect((await t.api.get("/api/v1/admin/users").set("Cookie", learner.cookie)).status).toBe(403);
  });

  it("requires two-step setup before any staff data is served", async () => {
    const t = harness();
    const a = await t.staff("a@example.rw", ["admin"], { mfa: false });
    const res = await a.get("/users");
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("MFA_SETUP_REQUIRED");
  });

  it("requires a fresh verification after sign-in once the factor is on", async () => {
    const t = harness();
    const a = await t.staff("a@example.rw");
    expect((await a.get("/users")).status).toBe(200);
    const cookie = await t.login("a@example.rw"); // a brand new session has not passed MFA
    const blocked = await t.api.get("/api/v1/admin/users").set("Cookie", cookie);
    expect(blocked.status).toBe(403);
    expect(errorOf(blocked).code).toBe("MFA_REQUIRED");
    const ok = await t.api
      .post("/api/v1/admin/mfa/verify")
      .set(CSRF)
      .set("Cookie", cookie)
      .send({ code: t.codeAt(a.secret, new Date(Date.now() + 30_000)) });
    expect(ok.status).toBe(204);
    expect((await t.api.get("/api/v1/admin/users").set("Cookie", cookie)).status).toBe(200);
  });

  it("does not reveal admin modules until MFA is verified", async () => {
    const t = harness();
    const a = await t.staff("a@example.rw", ["admin"], { mfa: false });
    const meta = await a.get("/meta");
    expect(JSON.stringify(meta.body)).not.toContain("users");
  });

  it("refuses a replayed code, bad codes and locks after repeated failures", async () => {
    const t = harness();
    const a = await t.staff("a@example.rw");
    const cookie = await t.login("a@example.rw");
    const verify = (code: string) =>
      t.api.post("/api/v1/admin/mfa/verify").set(CSRF).set("Cookie", cookie).send({ code });
    // the code used to enable the factor cannot be replayed
    expect((await verify(t.codeAt(a.secret, new Date()))).status).toBe(400);
    for (let i = 0; i < 4; i += 1) expect((await verify("000000")).status).toBe(400);
    await verify("000000");
    const user = t.users.all.get(a.id);
    expect(user?.lockedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now());
  });

  it("accepts a recovery code once", async () => {
    const t = harness();
    const a = await t.staff("a@example.rw");
    const code = a.recoveryCodes[0] ?? "";
    const c1 = await t.login("a@example.rw");
    const use = (cookie: string) =>
      t.api.post("/api/v1/admin/mfa/verify").set(CSRF).set("Cookie", cookie).send({ code });
    expect((await use(c1)).status).toBe(204);
    const c2 = await t.login("a@example.rw");
    expect((await use(c2)).status).toBe(400);
  });

  it("stores the secret encrypted and returns recovery codes only at enable time", async () => {
    const t = harness();
    const a = await t.staff("a@example.rw");
    const stored = t.users.all.get(a.id)?.totp;
    expect(stored?.secretEnc.startsWith("v1.")).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(a.secret);
    for (const code of a.recoveryCodes) expect(JSON.stringify(stored)).not.toContain(code);
    expect(a.recoveryCodes).toHaveLength(10);
    expect(JSON.stringify((await a.get("/users/" + a.id)).body)).not.toContain("secretEnc");
  });

  it("requires the CSRF header on staff mutations", async () => {
    const t = harness();
    const a = await t.staff("a@example.rw");
    const res = await t.api
      .post(`/api/v1/admin/users/${a.id}/revoke-sessions`)
      .set("Cookie", a.cookie);
    expect(res.status).toBe(403);
  });
});

describe("permission matrix", () => {
  it("gives admin everything and learners nothing", () => {
    expect(isStaff(["learner"])).toBe(false);
    expect(permissionsOf(["learner"]).size).toBe(0);
    expect(can(["admin"], "settings:manage")).toBe(true);
  });

  it("limits editors to content and support to leads and referrals", () => {
    expect(can(["editor"], "courses:write")).toBe(true);
    expect(can(["editor"], "users:manage")).toBe(false);
    expect(can(["editor"], "leads:read")).toBe(false);
    expect(can(["support"], "leads:write")).toBe(true);
    expect(can(["support"], "courses:write")).toBe(false);
    expect(can(["support"], "roles:manage")).toBe(false);
  });

  it("enforces the matrix over HTTP", async () => {
    const t = harness();
    const editor = await t.staff("e@example.rw", ["editor"]);
    const support = await t.staff("s@example.rw", ["support"]);
    expect((await editor.get("/courses")).status).toBe(200);
    expect((await editor.get("/leads")).status).toBe(403);
    expect((await editor.get("/users")).status).toBe(403);
    expect((await support.get("/leads")).status).toBe(200);
    expect((await support.get("/courses")).status).toBe(403);
    expect((await support.get("/settings")).status).toBe(403);
    const modules = (await editor.get("/meta")).body as { modules: { id: string }[] };
    expect(modules.modules.map((m) => m.id)).not.toContain("users");
  });
});
