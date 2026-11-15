import request from "supertest";
import { buildTestApp } from "./fixtures.js";
import { base32Decode, hotp, stepOf } from "../modules/admin/totp.js";
import type { Role } from "../modules/users/users.types.js";

export const PASSWORD = "correct horse battery";
export const CSRF = { "X-Requested-With": "mdl-web" };

type Ctx = ReturnType<typeof buildTestApp>;

/** Test harness: real HTTP surface over in-memory adapters, with helpers for users, staff and TOTP. */
export function harness(options: Parameters<typeof buildTestApp>[0] = {}) {
  const ctx = buildTestApp({
    ...options,
    env: { RATE_LIMIT_AUTH_PER_15MIN: "1000", ...options.env },
  });
  const api = request(ctx.app);

  const cookieOf = (res: { headers: Record<string, unknown> }): string => {
    const first = (res.headers["set-cookie"] as string[] | undefined)?.[0];
    if (first === undefined) throw new Error("no cookie");
    return first.split(";")[0] ?? "";
  };

  async function signUp(
    email: string,
    extra: Record<string, unknown> = {},
    opts: { verify?: boolean } = {},
  ) {
    const res = await api.post("/api/v1/auth/register").send({
      email,
      password: PASSWORD,
      displayName: "Test User",
      ageBracket: "16_plus",
      consent: true,
      privacyNoticeVersion: "2026-11",
      ...extra,
    });
    if (opts.verify !== false) {
      const mail = ctx.mailer.sent.filter((m) => m.kind === "verify" && m.to === email).at(-1);
      if (mail?.token === undefined) throw new Error("no verify mail");
      await api.post("/api/v1/auth/verify-email").send({ token: mail.token });
    }
    return res;
  }

  const idOf = (email: string): string => {
    const user = [...ctx.users.all.values()].find((u) => u.email === email);
    if (user === undefined) throw new Error(`no user ${email}`);
    return user.id;
  };

  async function login(email: string): Promise<string> {
    const res = await api.post("/api/v1/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200) throw new Error(`login failed ${res.status}`);
    return cookieOf(res);
  }

  /** Registers, verifies and logs in a learner. */
  async function learner(email: string, extra: Record<string, unknown> = {}) {
    await signUp(email, extra);
    return { email, id: idOf(email), cookie: await login(email) };
  }

  function setRoles(email: string, roles: Role[]): void {
    const user = [...ctx.users.all.values()].find((u) => u.email === email);
    if (user === undefined) throw new Error("no user");
    ctx.users.all.set(user.id, { ...user, roles });
  }

  const codeAt = (secret: string, at: Date): string => hotp(base32Decode(secret), stepOf(at));

  /** Registers staff with the given role, signs in and (optionally) completes MFA. */
  async function staff(email: string, roles: Role[] = ["admin"], opts: { mfa?: boolean } = {}) {
    await signUp(email);
    setRoles(email, roles);
    const cookie = await login(email);
    let secret = "";
    let recoveryCodes: string[] = [];
    if (opts.mfa !== false) {
      const setup = await api.post("/api/v1/admin/mfa/setup").set(CSRF).set("Cookie", cookie);
      secret = (setup.body as { secret: string }).secret;
      const enable = await api
        .post("/api/v1/admin/mfa/enable")
        .set(CSRF)
        .set("Cookie", cookie)
        .send({ code: codeAt(secret, new Date()) });
      recoveryCodes = (enable.body as { recoveryCodes: string[] }).recoveryCodes;
    }
    const get = (path: string) => api.get(`/api/v1/admin${path}`).set("Cookie", cookie);
    const send = (method: "post" | "put" | "patch" | "delete") => (path: string, body?: object) => {
      const req = api[method](`/api/v1/admin${path}`).set(CSRF).set("Cookie", cookie);
      return body === undefined ? req : req.send(body);
    };
    return {
      email,
      id: idOf(email),
      cookie,
      secret,
      recoveryCodes,
      get,
      post: send("post"),
      put: send("put"),
      patch: send("patch"),
      del: send("delete"),
    };
  }

  return { ...ctx, api, cookieOf, signUp, idOf, login, learner, staff, setRoles, codeAt } as Ctx & {
    api: typeof api;
    cookieOf: typeof cookieOf;
    signUp: typeof signUp;
    idOf: typeof idOf;
    login: typeof login;
    learner: typeof learner;
    staff: typeof staff;
    setRoles: typeof setRoles;
    codeAt: typeof codeAt;
  };
}
