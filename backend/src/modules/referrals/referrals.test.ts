import { describe, expect, it } from "vitest";
import { CSRF, harness } from "../../testing/harness.js";

type H = ReturnType<typeof harness>;
interface Me {
  enabled: boolean;
  code: string;
  threshold: number;
  joined: number;
  waiting: number;
  unlocked: boolean;
}

const errorCode = (res: { body: unknown }): string =>
  (res.body as { error: { code: string } }).error.code;

const me = async (t: H, cookie: string): Promise<Me> =>
  (await t.api.get("/api/v1/referrals/me").set("Cookie", cookie)).body as Me;

async function referrerWithCode(t: H, email = "ref@example.rw") {
  const referrer = await t.learner(email);
  const status = await me(t, referrer.cookie);
  return { ...referrer, code: status.code };
}

describe("referral growth loop", () => {
  it("issues one stable, well-formed code per learner", async () => {
    const t = harness();
    const r = await referrerWithCode(t);
    expect(r.code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect((await me(t, r.cookie)).code).toBe(r.code);
  });

  it("counts a verified invitee and unlocks at the threshold", async () => {
    const t = harness();
    const r = await referrerWithCode(t);
    const start = await me(t, r.cookie);
    expect(start).toMatchObject({ joined: 0, unlocked: false, threshold: start.threshold });
    for (let i = 0; i < start.threshold; i += 1) {
      await t.signUp(`friend${i}+x@example.rw`.replace("+x", String(i)), { referralCode: r.code });
    }
    const done = await me(t, r.cookie);
    expect(done.joined).toBe(start.threshold);
    expect(done.unlocked).toBe(true);
  });

  it("does not count an invitee until their email is verified", async () => {
    const t = harness();
    const r = await referrerWithCode(t);
    await t.signUp("pending@example.rw", { referralCode: r.code }, { verify: false });
    const s = await me(t, r.cookie);
    expect(s.joined).toBe(0);
    expect(s.waiting).toBe(1);
  });

  it("silently ignores unknown codes and never reveals whether a code exists", async () => {
    const t = harness();
    const ok = await t.signUp("a@example.rw", { referralCode: "ZZZZZZZZ" });
    expect(ok.status).toBe(202);
    const r = await referrerWithCode(t);
    const real = await t.signUp("b@example.rw", { referralCode: r.code });
    expect(real.status).toBe(202);
    expect(real.body).toEqual(ok.body);
  });

  it("rejects self-referral without telling the referrer", async () => {
    const t = harness();
    const r = await referrerWithCode(t);
    await t.signUp("ref+alt@example.rw", { referralCode: r.code });
    const s = await me(t, r.cookie);
    expect(s.joined).toBe(0);
    expect(s.waiting).toBe(0);
    expect(JSON.stringify(s)).not.toMatch(/reject|self/i);
  });

  it("rejects disposable email domains", async () => {
    const t = harness();
    const r = await referrerWithCode(t);
    await t.signUp("x@mailinator.com", { referralCode: r.code });
    expect((await me(t, r.cookie)).joined).toBe(0);
  });

  it("counts a plus-tagged duplicate of the same mailbox once", async () => {
    const t = harness();
    const r = await referrerWithCode(t);
    await t.signUp("pal@example.rw", { referralCode: r.code });
    await t.signUp("pal+two@example.rw", { referralCode: r.code });
    expect((await me(t, r.cookie)).joined).toBe(1);
  });

  it("is disabled cleanly by settings", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const current = (await admin.get("/settings")).body as {
      version: number;
      settings: { referral: Record<string, unknown> };
    };
    const put = await admin.put("/settings", {
      version: current.version,
      settings: { ...current.settings, referral: { ...current.settings.referral, enabled: false } },
    });
    expect(put.status).toBe(200);
    const site = await t.api.get("/api/v1/site");
    expect((site.body as { referralEnabled: boolean }).referralEnabled).toBe(false);
    const r = await t.learner("late@example.rw");
    expect((await me(t, r.cookie)).enabled).toBe(false);
  });

  it("records visits without leaking validity and tolerates junk", async () => {
    const t = harness();
    const r = await referrerWithCode(t);
    const a = await t.api.post("/api/v1/referrals/visit").set(CSRF).send({ code: r.code });
    const b = await t.api.post("/api/v1/referrals/visit").set(CSRF).send({ code: "nonsense" });
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
  });
});

describe("staff review of referrals", () => {
  it("lets staff reject a qualified referral, which revokes the unlock", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const r = await referrerWithCode(t);
    const threshold = (await me(t, r.cookie)).threshold;
    for (let i = 0; i < threshold; i += 1)
      await t.signUp(`kid${i}@example.rw`, { referralCode: r.code });
    expect((await me(t, r.cookie)).unlocked).toBe(true);
    const list = (await admin.get("/referrals?status=qualified")).body as {
      items: { id: string }[];
    };
    expect(list.items.length).toBe(threshold);
    const first = list.items[0]?.id ?? "";
    const res = await admin.post(`/referrals/${first}/reject`, { reason: "suspicious" });
    expect(res.status).toBeLessThan(300);
    expect((await me(t, r.cookie)).unlocked).toBe(false);
    expect(t.audit.events.some((e) => e.action === "referral.revoked")).toBe(true);
  });

  it("support can review but a plain learner cannot", async () => {
    const t = harness();
    const support = await t.staff("s@example.rw", ["support"]);
    expect((await support.get("/referrals")).status).toBe(200);
    const l = await t.learner("l@example.rw");
    expect((await t.api.get("/api/v1/admin/referrals").set("Cookie", l.cookie)).status).toBe(403);
  });
});

describe("unlock codes", () => {
  it("redeems an admin-created code once per user and counts uses", async () => {
    const t = harness();
    const admin = await t.staff("admin@example.rw");
    const created = await admin.post("/unlock-codes", {
      kind: "partner",
      label: "School X",
      code: "SCHOOLX2026",
      maxUses: 1,
      courseSlugs: [],
    });
    expect(created.status).toBeLessThan(300);
    const a = await t.learner("a@example.rw");
    const b = await t.learner("b@example.rw");
    const redeem = (cookie: string, code: string) =>
      t.api.post("/api/v1/unlock/redeem").set(CSRF).set("Cookie", cookie).send({ code });
    expect((await redeem(a.cookie, "SCHOOLX2026")).status).toBe(200);
    const second = await redeem(b.cookie, "SCHOOLX2026"); // exhausted
    const nope = await redeem(b.cookie, "DOESNOTEXIST");
    expect(second.status).toBe(nope.status);
    expect(errorCode(second)).toBe(errorCode(nope));
  });

  it("requires sign-in to redeem", async () => {
    const t = harness();
    const res = await t.api.post("/api/v1/unlock/redeem").set(CSRF).send({ code: "ABCDEFG" });
    expect(res.status).toBe(401);
  });
});
