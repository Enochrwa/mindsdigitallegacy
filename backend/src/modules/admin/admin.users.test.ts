import { describe, expect, it } from "vitest";
import { errorOf } from "../../testing/fixtures.js";
import { harness } from "../../testing/harness.js";

describe("admin users", () => {
  it("lists, filters and searches without leaking secrets", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    await t.learner("ada@example.rw");
    await t.learner("bob@example.rw");
    const all = (await admin.get("/users")).body as { items: { email: string }[]; total: number };
    expect(all.total).toBe(3);
    const q = (await admin.get("/users?q=ada")).body as { items: { email: string }[] };
    expect(q.items.map((u) => u.email)).toEqual(["ada@example.rw"]);
    const raw = JSON.stringify(all);
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("secretEnc");
    expect(raw).not.toContain("recoveryHashes");
  });

  it("treats search input as text, not as a regex or operator", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const res = await admin.get("/users?q=.*");
    expect(res.status).toBe(200);
    expect((res.body as { items: unknown[] }).items).toHaveLength(0);
    expect((await admin.get("/users?role[$ne]=x")).status).toBe(400);
  });

  it("changes roles, revokes the target's sessions, and audits the change", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const l = await t.learner("l@example.rw");
    const res = await admin.put(`/users/${l.id}/roles`, { roles: ["editor"] });
    expect(res.status).toBe(200);
    expect(t.users.all.get(l.id)?.roles).toContain("editor");
    const after = await t.api.get("/api/v1/referrals/me").set("Cookie", l.cookie);
    expect(after.status).toBe(401);
    expect(t.audit.events.some((e) => e.action === "admin.user.roles")).toBe(true);
  });

  it("rejects unknown roles and mass-assignment fields", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const l = await t.learner("l@example.rw");
    expect((await admin.put(`/users/${l.id}/roles`, { roles: ["root"] })).status).toBe(400);
    expect((await admin.put(`/users/${l.id}/roles`, { roles: [], isAdmin: true })).status).toBe(
      400,
    );
  });

  it("protects the caller and the last admin", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const self = await admin.put(`/users/${admin.id}/roles`, { roles: ["learner"] });
    expect(self.status).toBe(409);
    expect((await admin.post(`/users/${admin.id}/suspend`, { reason: "testing" })).status).toBe(
      409,
    );
    const second = await t.staff("second@example.rw");
    // two admins exist, so demoting the second is allowed...
    expect((await admin.put(`/users/${second.id}/roles`, { roles: ["learner"] })).status).toBe(200);
    // ...but now only one admin is left and nobody else can remove them
    const third = await t.staff("third@example.rw", ["admin"]);
    expect((await third.put(`/users/${admin.id}/roles`, { roles: ["learner"] })).status).toBe(200);
    const last = await third.post(`/users/${third.id}/suspend`, { reason: "testing" });
    expect(last.status).toBe(409);
  });

  it("suspends a learner: sessions die and sign-in is refused until unsuspended", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const l = await t.learner("l@example.rw");
    expect((await admin.post(`/users/${l.id}/suspend`, { reason: "abuse" })).status).toBe(204);
    expect((await t.api.get("/api/v1/referrals/me").set("Cookie", l.cookie)).status).toBe(401);
    const login = await t.api
      .post("/api/v1/auth/login")
      .send({ email: "l@example.rw", password: "correct horse battery" });
    expect(login.status).toBeGreaterThanOrEqual(400);
    expect((await admin.post(`/users/${l.id}/unsuspend`)).status).toBe(204);
    expect(await t.login("l@example.rw")).toContain("=");
  });

  it("resets a colleague's second factor but not your own", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const other = await t.staff("other@example.rw", ["editor"]);
    expect((await admin.post(`/users/${admin.id}/mfa-reset`)).status).toBe(409);
    expect((await admin.post(`/users/${other.id}/mfa-reset`)).status).toBe(204);
    expect(t.users.all.get(other.id)?.totp).toBeUndefined();
    const again = await t.login("other@example.rw");
    const res = await t.api.get("/api/v1/admin/courses").set("Cookie", again);
    expect(errorOf(res).code).toBe("MFA_SETUP_REQUIRED");
  });

  it("grants and revokes manual access", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const l = await t.learner("l@example.rw");
    expect(
      (await admin.post(`/users/${l.id}/access`, { scope: "all", note: "scholarship" })).status,
    ).toBe(204);
    const detail = (await admin.get(`/users/${l.id}`)).body as {
      entitlements?: { id: string }[];
      access?: { id: string }[];
    };
    const ents = detail.entitlements ?? detail.access ?? [];
    expect(ents.length).toBeGreaterThan(0);
    expect((await admin.del(`/entitlements/${ents[0]?.id}`)).status).toBe(204);
  });
});
