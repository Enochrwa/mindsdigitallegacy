import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { errorOf } from "../../testing/fixtures.js";
import { CSRF, PASSWORD, harness } from "../../testing/harness.js";
import { fakeProvider } from "../../testing/memory.oauth.js";
import { cleanName, safeNext } from "./oauth.service.js";
import { ProviderError } from "./oauth.types.js";
import type { ProviderAdapter, ProviderId } from "./oauth.types.js";

const WEB = "http://localhost:3000";

const ADA = { subject: "g-ada", email: "ada@example.rw", emailVerified: true, name: "Ada Uwase" };

function setup() {
  const google = fakeProvider("google", {
    ada: ADA,
    other: {
      subject: "g-other",
      email: "other@example.rw",
      emailVerified: true,
      name: "Other Person",
    },
    twin: { subject: "g-twin", email: "taken@example.rw", emailVerified: true, name: "Twin" },
    boom: new ProviderError("invalid_token", "bad"),
  });
  const microsoft = fakeProvider("microsoft", {
    mo: { subject: "m-1", email: "mo@example.rw", emailVerified: false, name: "Mo Mugisha" },
    mo2: { subject: "m-2", email: "mo2@example.rw", emailVerified: false, name: "Mo Two" },
    noemail: { subject: "m-3", email: undefined, emailVerified: false, name: "No Email" },
  });
  const t = harness({
    oauthProviders: new Map<ProviderId, ProviderAdapter>([
      ["google", google],
      ["microsoft", microsoft],
    ]),
  });
  return { t, google, microsoft };
}
type T = ReturnType<typeof setup>["t"];

const cookieValue = (
  res: { headers: Record<string, unknown> },
  name: string,
): string | undefined => {
  const all = (res.headers["set-cookie"] as string[] | undefined) ?? [];
  const hit = all.find((c) => c.startsWith(`${name}=`));
  return hit?.split(";")[0];
};
const rawCookie = (res: { headers: Record<string, unknown> }, name: string): string =>
  ((res.headers["set-cookie"] as string[] | undefined) ?? []).find((c) =>
    c.startsWith(`${name}=`),
  ) ?? "";

async function start(t: T, provider: string, next?: string) {
  const res = await t.api
    .get(`/api/v1/auth/oauth/${provider}/start`)
    .query(next === undefined ? {} : { next });
  const location = res.headers["location"];
  const state = location === undefined ? null : new URL(location).searchParams.get("state");
  return { res, state, stateCookie: cookieValue(res, "mdl_oauth_state") };
}

const callback = (t: T, provider: string, query: Record<string, string>, cookies: string[]) =>
  t.api
    .get(`/api/v1/auth/oauth/${provider}/callback`)
    .query(query)
    .set("Cookie", cookies.join("; "));

/** Runs a whole "arrive from the provider" visit and returns the callback response. */
async function visit(t: T, provider: string, code: string, extraCookies: string[] = []) {
  const s = await start(t, provider);
  if (s.state === null || s.stateCookie === undefined) throw new Error("start failed");
  const res = await callback(t, provider, { code, state: s.state }, [
    s.stateCookie,
    ...extraCookies,
  ]);
  return { res, s };
}

const body = (res: { body: unknown }): Record<string, unknown> =>
  res.body as Record<string, unknown>;
const where = (res: { headers: Record<string, unknown> }): string =>
  String(res.headers["location"]);
const post = (
  t: T,
  path: string,
  cookies: string[],
  body: object = {},
  headers: Record<string, string> = CSRF,
) =>
  t.api.post(`/api/v1/auth/oauth${path}`).set(headers).set("Cookie", cookies.join("; ")).send(body);

const FORM = { ageBracket: "16_plus", consent: true, privacyNoticeVersion: "2026-11" };

/** New person via Google, all the way to a signed-in session. Returns the session cookie. */
async function signUpWithGoogle(t: T, code = "ada") {
  const { res } = await visit(t, "google", code);
  const pending = cookieValue(res, "mdl_oauth_signup");
  if (pending === undefined) throw new Error(`no signup cookie: ${where(res)}`);
  const done = await post(t, "/complete", [pending], FORM);
  const session = cookieValue(done, "mdl_sid");
  return { done, session, pending };
}

describe("provider list and start", () => {
  it("lists only enabled providers, with no keys or secrets", async () => {
    const { t } = setup();
    const res = await t.api.get("/api/v1/auth/oauth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      providers: [
        { id: "google", label: "Google" },
        { id: "microsoft", label: "Microsoft" },
      ],
    });
  });

  it("sends the browser to the provider with a sealed, httpOnly state cookie", async () => {
    const { t, google } = setup();
    const s = await start(t, "google");
    expect(s.res.status).toBe(302);
    expect(where(s.res)).toMatch(/^https:\/\/google\.provider\.test\/authorize\?/);
    const raw = rawCookie(s.res, "mdl_oauth_state");
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\/api\/v1\/auth\/oauth/);
    expect(s.state).toBeTruthy();
    expect(raw).not.toContain(s.state ?? "x");
    expect(google.authorized).toHaveLength(1);
  });

  it("answers 404 for providers that are unknown or not switched on", async () => {
    const { t } = setup();
    for (const name of ["github", "nope", "..%2Fetc"]) {
      expect((await t.api.get(`/api/v1/auth/oauth/${name}/start`)).status).toBe(404);
    }
  });
});

describe("signing up with a provider that verifies the email", () => {
  it("runs the whole flow: provider, age and consent, then a working session", async () => {
    const { t } = setup();
    const { res } = await visit(t, "google", "ada");
    expect(res.status).toBe(302);
    expect(where(res)).toBe(`${WEB}/auth/complete`);
    const pending = cookieValue(res, "mdl_oauth_signup");
    expect(pending).toBeDefined();
    expect(t.users.all.size).toBe(0); // nothing is created before the person agrees

    const info = await t.api.get("/api/v1/auth/oauth/pending").set("Cookie", pending ?? "");
    expect(info.body).toEqual({
      pending: {
        provider: "google",
        label: "Google",
        email: "ada@example.rw",
        name: "Ada Uwase",
        needsCode: false,
        codeSent: false,
      },
    });

    const done = await post(t, "/complete", [pending ?? ""], FORM);
    expect(done.status).toBe(201);
    expect(done.body).toEqual({ status: "signed_in" });
    const session = cookieValue(done, "mdl_sid");
    expect(session).toBeDefined();

    const me = await t.api.get("/api/v1/users/me").set("Cookie", session ?? "");
    expect(me.status).toBe(200);
    expect(body(me)["user"]).toMatchObject({
      email: "ada@example.rw",
      displayName: "Ada Uwase",
      emailVerified: true,
      hasPassword: false,
    });
    expect(t.oauthIdentities).toBeDefined();
    expect(t.audit.events.map((e) => e.action)).toEqual(
      expect.arrayContaining(["auth.oauth.signup", "auth.oauth.login"]),
    );
    expect(t.mailer.sent).toHaveLength(0); // the provider already vouched for the mailbox
  });

  it("signs the same person back in next time, without creating another account", async () => {
    const { t } = setup();
    await signUpWithGoogle(t);
    const { res } = await visit(t, "google", "ada");
    expect(where(res)).toBe(`${WEB}/account`);
    expect(cookieValue(res, "mdl_sid")).toBeDefined();
    expect(t.users.all.size).toBe(1);
  });

  it("only follows a same-site next page", async () => {
    const { t } = setup();
    await signUpWithGoogle(t);
    const good = await start(t, "google", "/learning");
    const ok = await callback(t, "google", { code: "ada", state: good.state ?? "" }, [
      good.stateCookie ?? "",
    ]);
    expect(where(ok)).toBe(`${WEB}/learning`);
    for (const evil of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      const s = await start(t, "google", evil);
      const res = await callback(t, "google", { code: "ada", state: s.state ?? "" }, [
        s.stateCookie ?? "",
      ]);
      expect(where(res), evil).toBe(`${WEB}/account`);
    }
  });

  it("needs the consent box and an age group, like the email form", async () => {
    const { t } = setup();
    const { res } = await visit(t, "google", "ada");
    const pending = cookieValue(res, "mdl_oauth_signup") ?? "";
    expect((await post(t, "/complete", [pending], { ...FORM, consent: false })).status).toBe(400);
    expect(
      (await post(t, "/complete", [pending], { consent: true, privacyNoticeVersion: "v" })).status,
    ).toBe(400);
    expect((await post(t, "/complete", [pending], { ...FORM, role: "admin" })).status).toBe(400);
    expect((await post(t, "/complete", [pending], FORM, {})).status).toBe(403); // custom header required
    expect(t.users.all.size).toBe(0);
  });

  it("cleans up names that come from the provider", () => {
    expect(cleanName("  Ada   <script>alert(1)</script>  Uwase \n")).toBe(
      "Ada scriptalert(1)/script Uwase",
    );
    expect(cleanName("x")).toBe("MDL learner");
    expect(cleanName("A".repeat(300)).length).toBe(80);
    expect(safeNext("/x?y=1")).toBe("/x?y=1");
    expect(safeNext("//x")).toBe("/account");
  });
});

describe("a social-only account and passwords", () => {
  it("cannot be entered with any password, and looks like any wrong password", async () => {
    const { t } = setup();
    await signUpWithGoogle(t);
    for (const password of [PASSWORD, "x", "dummy-password-for-timing"]) {
      const res = await t.api
        .post("/api/v1/auth/login")
        .send({ email: "ada@example.rw", password });
      expect(res.status, password).toBe(401);
      expect(errorOf(res).code).toBe("INVALID_CREDENTIALS");
    }
    const unknown = await t.api
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.rw", password: PASSWORD });
    expect(errorOf(unknown).message).toBe(
      errorOf(
        await t.api
          .post("/api/v1/auth/login")
          .send({ email: "ada@example.rw", password: PASSWORD }),
      ).message,
    );
  });

  it("can add a password later through 'forgot password'", async () => {
    const { t } = setup();
    await signUpWithGoogle(t);
    await t.api.post("/api/v1/auth/password/forgot").send({ email: "ada@example.rw" });
    const mail = t.mailer.sent.find((m) => m.kind === "reset");
    expect(mail?.token).toBeDefined();
    const reset = await t.api
      .post("/api/v1/auth/password/reset")
      .send({ token: mail?.token, password: "a-brand-new-long-passphrase-2026" });
    expect(reset.status).toBe(200);
    const login = await t.api
      .post("/api/v1/auth/login")
      .send({ email: "ada@example.rw", password: "a-brand-new-long-passphrase-2026" });
    expect(login.status).toBe(200);
  });

  it("can be deleted by typing the email address, and only that", async () => {
    const { t } = setup();
    const { session } = await signUpWithGoogle(t);
    const cookie = session ?? "";
    const del = (body: object) =>
      t.api.delete("/api/v1/users/me").set(CSRF).set("Cookie", cookie).send(body);
    expect((await del({})).status).toBe(400);
    expect((await del({ confirmEmail: "someone@else.rw" })).status).toBe(401);
    expect((await del({ password: PASSWORD })).status).toBe(401);
    expect((await del({ confirmEmail: "ADA@example.rw" })).status).toBe(204);
    // A deleted account cannot be entered through the provider either.
    const { res } = await visit(t, "google", "ada");
    expect(where(res)).toContain("error=oauth_failed");
  });
});

describe("protection against forged and replayed callbacks", () => {
  it("refuses a callback without the state cookie, with the wrong state, or with a tampered cookie", async () => {
    const { t } = setup();
    const s = await start(t, "google");
    const noCookie = await callback(t, "google", { code: "ada", state: s.state ?? "" }, []);
    expect(where(noCookie)).toContain("error=oauth_expired");
    const wrongState = await callback(t, "google", { code: "ada", state: "attacker-state" }, [
      s.stateCookie ?? "",
    ]);
    expect(where(wrongState)).toContain("error=oauth_failed");
    const tampered = (s.stateCookie ?? "").slice(0, -3) + "AAA";
    const bad = await callback(t, "google", { code: "ada", state: s.state ?? "" }, [tampered]);
    expect(where(bad)).toContain("error=oauth_expired");
    expect(cookieValue(wrongState, "mdl_sid")).toBeUndefined();
    expect(t.users.all.size).toBe(0);
  });

  it("rejects a state cookie started for a different provider", async () => {
    const { t } = setup();
    const s = await start(t, "google");
    const res = await callback(t, "microsoft", { code: "mo", state: s.state ?? "" }, [
      s.stateCookie ?? "",
    ]);
    expect(where(res)).toContain("error=oauth_failed");
  });

  it("expires the state after ten minutes", async () => {
    let now = new Date("2026-12-01T10:00:00Z");
    const google = fakeProvider("google", { ada: ADA });
    const t = harness({
      now: () => now,
      oauthProviders: new Map<ProviderId, ProviderAdapter>([["google", google]]),
    });
    const s = await start(t, "google");
    now = new Date(now.getTime() + 11 * 60_000);
    const res = await callback(t, "google", { code: "ada", state: s.state ?? "" }, [
      s.stateCookie ?? "",
    ]);
    expect(where(res)).toContain("error=oauth_expired");
  });

  it("clears the state cookie on every callback, so it cannot be reused", async () => {
    const { t } = setup();
    const { res } = await visit(t, "google", "ada");
    expect(rawCookie(res, "mdl_oauth_state")).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  it("handles a cancelled sign-in, a provider error, a missing code and a failed exchange with fixed codes only", async () => {
    const { t } = setup();
    const denied = await start(t, "google");
    const d = await callback(
      t,
      "google",
      {
        error: "access_denied",
        error_description: "<script>x</script>",
        state: denied.state ?? "",
      },
      [denied.stateCookie ?? ""],
    );
    expect(where(d)).toContain("error=oauth_denied");
    expect(where(d)).not.toContain("script");
    const other = await start(t, "google");
    expect(
      where(
        await callback(t, "google", { error: "server_error", state: other.state ?? "" }, [
          other.stateCookie ?? "",
        ]),
      ),
    ).toContain("oauth_failed");
    const nocode = await start(t, "google");
    expect(
      where(await callback(t, "google", { state: nocode.state ?? "" }, [nocode.stateCookie ?? ""])),
    ).toContain("oauth_failed");
    const { res } = await visit(t, "google", "boom");
    expect(where(res)).toContain("error=oauth_failed");
    expect(t.users.all.size).toBe(0);
  });

  it("passes the PKCE verifier and nonce to the provider, matching what it was sent", async () => {
    const { t, google } = setup();
    await visit(t, "google", "ada");
    const sent = google.authorized[0];
    const got = google.exchanged[0];
    expect(got?.nonce).toBe(sent?.nonce);
    expect(
      createHash("sha256")
        .update(got?.verifier ?? "")
        .digest("base64url"),
    ).toBe(sent?.challenge);
    expect(got?.redirectUri).toBe("http://localhost:4000/api/v1/auth/oauth/google/callback");
  });
});

describe("account takeover by matching email", () => {
  it("never merges a provider account into an existing account with the same email", async () => {
    const { t } = setup();
    await t.learner("taken@example.rw");
    const before = [...t.users.all.values()].map((u) => ({ ...u }));
    const { res } = await visit(t, "google", "twin");
    expect(where(res)).toContain("error=oauth_account_exists");
    expect(cookieValue(res, "mdl_sid")).toBeUndefined();
    expect(cookieValue(res, "mdl_oauth_signup")).toBeUndefined();
    expect(t.oauthIdentities.all).toHaveLength(0);
    expect([...t.users.all.values()]).toEqual(before);
  });

  it("refuses when the provider gives no email", async () => {
    const { t } = setup();
    const { res } = await visit(t, "microsoft", "noemail");
    expect(where(res)).toContain("error=oauth_email_missing");
  });

  it("refuses at the last step if someone registered the email in the meantime", async () => {
    const { t } = setup();
    const { res } = await visit(t, "google", "ada");
    const pending = cookieValue(res, "mdl_oauth_signup") ?? "";
    await t.learner("ada@example.rw"); // registers the same email by password first
    const done = await post(t, "/complete", [pending], FORM);
    expect(done.status).toBe(409);
    expect(t.oauthIdentities.all).toHaveLength(0);
  });
});

describe("providers that do not vouch for the email", () => {
  it("makes the person prove the mailbox with a code before any account exists", async () => {
    const { t } = setup();
    const { res } = await visit(t, "microsoft", "mo");
    const pending = cookieValue(res, "mdl_oauth_signup") ?? "";
    const info = await t.api.get("/api/v1/auth/oauth/pending").set("Cookie", pending);
    expect(body(info)["pending"]).toMatchObject({ needsCode: true, codeSent: false });

    const sent = await post(t, "/complete", [pending], FORM);
    expect(sent.status).toBe(202);
    expect(sent.body).toEqual({ status: "code_sent", email: "mo@example.rw" });
    expect(t.users.all.size).toBe(0);
    const mail = t.mailer.sent.find((m) => m.kind === "code");
    expect(mail?.to).toBe("mo@example.rw");
    expect(mail?.code).toMatch(/^\d{8}$/);
    const stage2 = cookieValue(sent, "mdl_oauth_signup") ?? "";
    expect(stage2).not.toBe("");

    const wrong = await post(t, "/confirm-code", [stage2], { code: "00000000" });
    expect(wrong.status).toBe(400);
    expect(errorOf(wrong).code).toBe("INVALID_CODE");
    expect(t.users.all.size).toBe(0);

    const right = await post(t, "/confirm-code", [stage2], { code: mail?.code ?? "" });
    expect(right.status).toBe(201);
    expect(cookieValue(right, "mdl_sid")).toBeDefined();
    const user = [...t.users.all.values()][0];
    expect(user?.email).toBe("mo@example.rw");
    expect(user?.emailVerifiedAt).toBeDefined();
  });

  it("does not let one person's code finish someone else's sign-up", async () => {
    const { t } = setup();
    const a = await visit(t, "microsoft", "mo");
    const b = await visit(t, "microsoft", "mo2");
    const sentA = await post(t, "/complete", [cookieValue(a.res, "mdl_oauth_signup") ?? ""], FORM);
    const sentB = await post(t, "/complete", [cookieValue(b.res, "mdl_oauth_signup") ?? ""], FORM);
    const codeA = t.mailer.sent.filter((m) => m.kind === "code")[0]?.code ?? "";
    const attempt = await post(t, "/confirm-code", [cookieValue(sentB, "mdl_oauth_signup") ?? ""], {
      code: codeA,
    });
    expect(attempt.status).toBe(400);
    expect(t.users.all.size).toBe(0);
    void sentA;
  });

  it("cannot confirm a code that was never requested", async () => {
    const { t } = setup();
    const { res } = await visit(t, "microsoft", "mo");
    const r = await post(t, "/confirm-code", [cookieValue(res, "mdl_oauth_signup") ?? ""], {
      code: "12345678",
    });
    expect(errorOf(r).code).toBe("CODE_NOT_SENT");
  });

  it("expires a half-finished sign-up after fifteen minutes", async () => {
    let now = new Date("2026-12-01T10:00:00Z");
    const ms = fakeProvider("microsoft", {
      mo: { subject: "m-1", email: "mo@example.rw", emailVerified: false, name: "Mo" },
    });
    const t = harness({
      now: () => now,
      oauthProviders: new Map<ProviderId, ProviderAdapter>([["microsoft", ms]]),
    });
    const { res } = await visit(t, "microsoft", "mo");
    const pending = cookieValue(res, "mdl_oauth_signup") ?? "";
    now = new Date(now.getTime() + 16 * 60_000);
    const late = await post(t, "/complete", [pending], FORM);
    expect(errorOf(late).code).toBe("SIGNUP_EXPIRED");
    expect((await t.api.get("/api/v1/auth/oauth/pending").set("Cookie", pending)).body).toEqual({
      pending: null,
    });
  });
});

describe("learners under 16", () => {
  it("need a guardian, and the account waits for the guardian's confirmation", async () => {
    const { t } = setup();
    const { res } = await visit(t, "google", "ada");
    const pending = cookieValue(res, "mdl_oauth_signup") ?? "";
    const under = { ...FORM, ageBracket: "under_16" };
    expect((await post(t, "/complete", [pending], under)).status).toBe(400);
    expect(
      (await post(t, "/complete", [pending], { ...under, guardianEmail: "ada@example.rw" })).status,
    ).toBe(400);
    expect(
      (await post(t, "/complete", [pending], { ...FORM, guardianEmail: "parent@example.rw" }))
        .status,
    ).toBe(400);

    const ok = await post(t, "/complete", [pending], {
      ...under,
      guardianEmail: "parent@example.rw",
    });
    expect(ok.status).toBe(202);
    expect(ok.body).toEqual({ status: "guardian_pending" });
    expect(cookieValue(ok, "mdl_sid")).toBeUndefined();
    expect(t.mailer.sent.some((m) => m.kind === "guardian" && m.to === "parent@example.rw")).toBe(
      true,
    );
    // Until the guardian agrees, signing in through the provider is refused.
    const again = await visit(t, "google", "ada");
    expect(where(again.res)).toContain("error=oauth_inactive");
    expect(cookieValue(again.res, "mdl_sid")).toBeUndefined();
  });
});

describe("connecting and disconnecting accounts", () => {
  it("links a provider to the signed-in account, and then it can sign in", async () => {
    const { t } = setup();
    const ada = await t.learner("ada@example.rw");
    expect((await t.api.post("/api/v1/auth/oauth/google/link").set(CSRF)).status).toBe(401);
    expect(
      (await t.api.post("/api/v1/auth/oauth/google/link").set("Cookie", ada.cookie)).status,
    ).toBe(403);
    const link = await t.api
      .post("/api/v1/auth/oauth/google/link")
      .set(CSRF)
      .set("Cookie", ada.cookie);
    expect(link.status).toBe(200);
    const state = new URL(body(link)["url"] as string).searchParams.get("state");
    const done = await callback(t, "google", { code: "other", state: state ?? "" }, [
      cookieValue(link, "mdl_oauth_state") ?? "",
      ada.cookie,
    ]);
    expect(where(done)).toBe(`${WEB}/account?connected=google`);
    expect(t.oauthIdentities.all).toHaveLength(1);
    const list = await t.api.get("/api/v1/auth/oauth/identities").set("Cookie", ada.cookie);
    expect(list.body).toMatchObject({
      hasPassword: true,
      identities: [{ provider: "google", label: "Google", email: "other@example.rw" }],
    });
    // The linked account now signs in as Ada, even though the Google email is different.
    const signin = await visit(t, "google", "other");
    expect(where(signin.res)).toBe(`${WEB}/account`);
    expect(t.users.all.size).toBe(1);
    expect(t.audit.events.some((e) => e.action === "auth.oauth.link")).toBe(true);
  });

  it("refuses to finish a link in a different session (the 'attach my account to the victim' trick)", async () => {
    const { t } = setup();
    const victim = await t.learner("victim@example.rw");
    const attacker = await t.learner("attacker@example.rw");
    const link = await t.api
      .post("/api/v1/auth/oauth/google/link")
      .set(CSRF)
      .set("Cookie", attacker.cookie);
    const state = new URL(body(link)["url"] as string).searchParams.get("state");
    const stateCookie = cookieValue(link, "mdl_oauth_state") ?? "";
    // The victim's browser is made to finish the attacker's link (it somehow has the cookie), but its session differs.
    const res = await callback(t, "google", { code: "ada", state: state ?? "" }, [
      stateCookie,
      victim.cookie,
    ]);
    expect(where(res)).toContain("oauth_error=failed");
    expect(t.oauthIdentities.all).toHaveLength(0);
    // And with no session at all.
    const anon = await callback(t, "google", { code: "ada", state: state ?? "" }, [stateCookie]);
    expect(where(anon)).toContain("oauth_error=failed");
    expect(t.oauthIdentities.all).toHaveLength(0);
  });

  it("will not attach a provider account that already belongs to someone else", async () => {
    const { t } = setup();
    await signUpWithGoogle(t); // Ada's Google account now belongs to Ada
    const bob = await t.learner("bob@example.rw");
    const link = await t.api
      .post("/api/v1/auth/oauth/google/link")
      .set(CSRF)
      .set("Cookie", bob.cookie);
    const state = new URL(body(link)["url"] as string).searchParams.get("state");
    const res = await callback(t, "google", { code: "ada", state: state ?? "" }, [
      cookieValue(link, "mdl_oauth_state") ?? "",
      bob.cookie,
    ]);
    expect(where(res)).toContain("oauth_error=identity_in_use");
    expect(t.oauthIdentities.all).toHaveLength(1);
  });

  it("disconnects a provider, but never the last way to sign in", async () => {
    const { t } = setup();
    const { session } = await signUpWithGoogle(t); // Google is Ada's only way in
    const cookie = session ?? "";
    const only = await t.api
      .delete("/api/v1/auth/oauth/identities/google")
      .set(CSRF)
      .set("Cookie", cookie);
    expect(only.status).toBe(409);
    expect(errorOf(only).code).toBe("LAST_SIGN_IN_METHOD");
    expect(t.oauthIdentities.all).toHaveLength(1);
    // After adding a password it is allowed.
    await t.api.post("/api/v1/auth/password/forgot").send({ email: "ada@example.rw" });
    const mail = t.mailer.sent.find((m) => m.kind === "reset");
    await t.api
      .post("/api/v1/auth/password/reset")
      .send({ token: mail?.token, password: "a-brand-new-long-passphrase-2026" });
    const relog = await t.api
      .post("/api/v1/auth/login")
      .send({ email: "ada@example.rw", password: "a-brand-new-long-passphrase-2026" });
    const fresh = cookieValue(relog, "mdl_sid") ?? "";
    expect(
      (await t.api.delete("/api/v1/auth/oauth/identities/google").set(CSRF).set("Cookie", fresh))
        .status,
    ).toBe(204);
    expect(t.oauthIdentities.all).toHaveLength(0);
    expect(
      (await t.api.delete("/api/v1/auth/oauth/identities/google").set(CSRF).set("Cookie", fresh))
        .status,
    ).toBe(404);
    expect(
      (await t.api.delete("/api/v1/auth/oauth/identities/google").set("Cookie", fresh)).status,
    ).toBe(403);
  });

  it("needs a signed-in session to list or remove connections", async () => {
    const { t } = setup();
    expect((await t.api.get("/api/v1/auth/oauth/identities")).status).toBe(401);
    expect((await t.api.delete("/api/v1/auth/oauth/identities/google").set(CSRF)).status).toBe(401);
  });
});

describe("account standing and privacy", () => {
  it("blocks a suspended account from signing in with a provider", async () => {
    const { t } = setup();
    await signUpWithGoogle(t);
    const user = [...t.users.all.values()][0];
    if (user === undefined) throw new Error("no user");
    t.users.all.set(user.id, { ...user, suspendedAt: new Date() });
    const { res } = await visit(t, "google", "ada");
    expect(where(res)).toContain("error=oauth_inactive");
    expect(cookieValue(res, "mdl_sid")).toBeUndefined();
  });

  it("audits sign-ups, sign-ins and failures without storing tokens or codes", async () => {
    const { t } = setup();
    await signUpWithGoogle(t);
    await visit(t, "google", "boom");
    const text = JSON.stringify(t.audit.events);
    expect(text).toContain("auth.oauth.signup");
    expect(text).toContain("auth.oauth.failure");
    expect(text).not.toMatch(/"code":|access_token|id_token|client_secret/);
  });

  it("includes the linked providers in the person's data export", async () => {
    const { t } = setup();
    const { session } = await signUpWithGoogle(t);
    const res = await t.api.get("/api/v1/users/me/export").set("Cookie", session ?? "");
    expect(res.status).toBe(200);
    expect(body(res)["signInMethods"]).toEqual([
      expect.objectContaining({ provider: "google", email: "ada@example.rw" }),
    ]);
    expect(JSON.stringify(res.body)).not.toContain("g-ada");
  });

  it("limits how fast the callback can be hit", async () => {
    const google = fakeProvider("google", { ada: ADA });
    const t = harness({
      env: { RATE_LIMIT_AUTH_PER_15MIN: "2" },
      oauthProviders: new Map<ProviderId, ProviderAdapter>([["google", google]]),
    });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1)
      statuses.push((await t.api.get("/api/v1/auth/oauth/google/start")).status);
    expect(statuses).toContain(429);
  });
});
