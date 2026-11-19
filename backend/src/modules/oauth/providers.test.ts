import { SignJWT, exportJWK, generateKeyPair } from "jose";
import type { JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createProviders } from "./providers.js";
import { ProviderError } from "./oauth.types.js";
import type { HttpFetch, OAuthSettings } from "./oauth.types.js";

const KEYS = { clientId: "client-123", clientSecret: "SUPER-SECRET-VALUE" };
const SETTINGS: OAuthSettings = {
  google: KEYS,
  microsoft: KEYS,
  github: KEYS,
  facebook: KEYS,
  linkedin: KEYS,
  microsoftTenant: "common",
  facebookVersion: "v25.0",
};
const REDIRECT = "https://api.example.rw/api/v1/auth/oauth/google/callback";
const TID = "9188040d-6c67-4c5b-b112-36a304b66dad";
const NONCE = "nonce-value-abc";

let signing: Awaited<ReturnType<typeof generateKeyPair>>;
let other: Awaited<ReturnType<typeof generateKeyPair>>;
let jwk: JWK;

beforeAll(async () => {
  signing = await generateKeyPair("RS256", { extractable: true });
  other = await generateKeyPair("RS256", { extractable: true });
  jwk = { ...(await exportJWK(signing.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
});

async function idToken(
  claims: Record<string, unknown>,
  opts: { key?: "signing" | "other"; exp?: string } = {},
) {
  const key = opts.key === "other" ? other.privateKey : signing.privateKey;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(key);
}

interface Call {
  url: string;
  init?: RequestInit;
}

/** A fake internet: answers only the URLs a test registers, and records every call. */
function fakeNet(routes: Record<string, (init?: RequestInit) => object | Response>) {
  const calls: Call[] = [];
  const fetchFn: HttpFetch = (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (key === undefined) return Promise.reject(new Error(`unexpected request to ${url}`));
    const out = routes[key]?.(init);
    return Promise.resolve(out instanceof Response ? out : Response.json(out));
  };
  return { fetchFn, calls };
}

const jwks = () => ({ keys: [jwk] });
const exchangeInput = {
  code: "the-code",
  verifier: "v".repeat(43),
  redirectUri: REDIRECT,
  nonce: NONCE,
};

async function rejected(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderError);
    return err as ProviderError;
  }
  throw new Error("expected a rejection");
}

describe("authorize URLs", () => {
  const providers = createProviders(SETTINGS, () => Promise.reject(new Error("no network")));
  const params = {
    state: "STATE1",
    nonce: "NONCE1",
    challenge: "CHALLENGE1",
    redirectUri: REDIRECT,
  };

  it("sends the state and redirect address, and never the client secret", () => {
    for (const [id, adapter] of providers) {
      const url = new URL(adapter.authorizeUrl(params));
      expect(url.searchParams.get("state"), id).toBe("STATE1");
      expect(url.searchParams.get("redirect_uri"), id).toBe(REDIRECT);
      expect(url.searchParams.get("client_id"), id).toBe("client-123");
      expect(url.toString(), id).not.toContain("SUPER-SECRET");
      expect(url.protocol).toBe("https:");
    }
  });

  it("uses PKCE for Google and Microsoft", () => {
    for (const id of ["google", "microsoft"] as const) {
      const url = new URL(providers.get(id)?.authorizeUrl(params) ?? "");
      expect(url.searchParams.get("code_challenge")).toBe("CHALLENGE1");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("nonce")).toBe("NONCE1");
    }
  });

  it("asks only for identity scopes", () => {
    expect(
      new URL(providers.get("google")?.authorizeUrl(params) ?? "").searchParams.get("scope"),
    ).toBe("openid email profile");
    expect(
      new URL(providers.get("github")?.authorizeUrl(params) ?? "").searchParams.get("scope"),
    ).toBe("read:user user:email");
    expect(
      new URL(providers.get("facebook")?.authorizeUrl(params) ?? "").searchParams.get("scope"),
    ).toBe("public_profile,email");
    expect(
      new URL(providers.get("linkedin")?.authorizeUrl(params) ?? "").searchParams.get("scope"),
    ).toBe("openid profile email");
  });

  it("uses the configured Microsoft tenant and Facebook version", () => {
    expect(providers.get("microsoft")?.authorizeUrl(params)).toContain(
      "login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(providers.get("facebook")?.authorizeUrl(params)).toContain(
      "facebook.com/v25.0/dialog/oauth",
    );
  });

  it("only offers providers whose keys are set", () => {
    const some = createProviders({
      ...SETTINGS,
      microsoft: undefined,
      github: undefined,
      facebook: undefined,
      linkedin: undefined,
    });
    expect([...some.keys()]).toEqual(["google"]);
    expect(createProviders({ microsoftTenant: "common", facebookVersion: "v25.0" }).size).toBe(0);
  });
});

describe("Google", () => {
  const claims = (over: Record<string, unknown> = {}) => ({
    iss: "https://accounts.google.com",
    aud: "client-123",
    sub: "g-1",
    nonce: NONCE,
    email: "ada@example.rw",
    email_verified: true,
    name: "Ada Uwase",
    ...over,
  });
  const run = (token: string, extra: Parameters<typeof fakeNet>[0] = {}) => {
    const net = fakeNet({
      "https://oauth2.googleapis.com/token": () => ({ id_token: token, access_token: "x" }),
      "https://www.googleapis.com/oauth2/v3/certs": jwks,
      ...extra,
    });
    const adapter = createProviders(SETTINGS, net.fetchFn).get("google");
    if (adapter === undefined) throw new Error("no adapter");
    return { net, result: adapter.exchange(exchangeInput) };
  };

  it("returns the verified identity", async () => {
    const { result } = run(await idToken(claims()));
    await expect(result).resolves.toEqual({
      provider: "google",
      subject: "g-1",
      email: "ada@example.rw",
      emailVerified: true,
      name: "Ada Uwase",
    });
  });

  it("sends the client secret and PKCE verifier in the POST body, not the URL", async () => {
    const { net, result } = run(await idToken(claims()));
    await result;
    const token = net.calls.find((c) => c.url.includes("token"));
    expect(token?.url).not.toContain("SUPER-SECRET");
    const body = (token?.init?.body as URLSearchParams).toString();
    expect(body).toContain("client_secret=SUPER-SECRET-VALUE");
    expect(body).toContain(`code_verifier=${"v".repeat(43)}`);
    expect(token?.init?.method).toBe("POST");
  });

  it("does not trust an email Google has not verified", async () => {
    const { result } = run(await idToken(claims({ email_verified: false })));
    expect((await result).emailVerified).toBe(false);
    const { result: text } = run(await idToken(claims({ email_verified: "true" })));
    expect((await text).emailVerified).toBe(true);
  });

  it("rejects a wrong nonce, audience, issuer, expiry and signing key", async () => {
    const bad: [string, Promise<string>][] = [
      ["nonce", idToken(claims({ nonce: "other" }))],
      ["audience", idToken(claims({ aud: "someone-else" }))],
      ["issuer", idToken(claims({ iss: "https://evil.example" }))],
      ["expired", idToken(claims(), { exp: "-10m" })],
      ["signature", idToken(claims(), { key: "other" })],
    ];
    for (const [name, token] of bad) {
      const { result } = run(await token);
      expect((await rejected(result)).code, name).toBe("invalid_token");
    }
  });

  it("rejects a token with no subject, an unsigned token and a missing id_token", async () => {
    const { result: noSub } = run(await idToken(claims({ sub: undefined })));
    expect((await rejected(noSub)).code).toBe("invalid_token");
    const unsigned = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims())).toString("base64url")}.`;
    const { result: none } = run(unsigned);
    expect((await rejected(none)).code).toBe("invalid_token");
    const net = fakeNet({ "https://oauth2.googleapis.com/token": () => ({ access_token: "x" }) });
    const adapter = createProviders(SETTINGS, net.fetchFn).get("google");
    expect((await rejected(adapter?.exchange(exchangeInput) ?? Promise.resolve())).code).toBe(
      "exchange_failed",
    );
  });

  it("reports a failing token endpoint without leaking provider text or secrets", async () => {
    const net = fakeNet({
      "https://oauth2.googleapis.com/token": () =>
        new Response('{"error":"invalid_grant","secret":"SUPER-SECRET-VALUE"}', { status: 400 }),
    });
    const err = await rejected(
      createProviders(SETTINGS, net.fetchFn).get("google")?.exchange(exchangeInput) ??
        Promise.resolve(),
    );
    expect(err.code).toBe("exchange_failed");
    expect(err.message).not.toContain("SUPER-SECRET");
  });

  it("caches the provider keys, and refreshes them once when a new key id appears", async () => {
    const token = await idToken(claims());
    let keySets = 0;
    let served: { keys: JWK[] } = { keys: [{ ...jwk, kid: "old" }] };
    const net = fakeNet({
      "https://oauth2.googleapis.com/token": () => ({ id_token: token }),
      "https://www.googleapis.com/oauth2/v3/certs": () => {
        keySets += 1;
        return served;
      },
    });
    const adapter = createProviders(SETTINGS, net.fetchFn).get("google");
    // First call: cached set lacks kid "k1", so one refresh is made. The server now serves the right key.
    served = { keys: [{ ...jwk, kid: "old" }] };
    const first = adapter?.exchange(exchangeInput);
    await expect(first).rejects.toBeInstanceOf(ProviderError);
    expect(keySets).toBe(2);
    served = { keys: [jwk] };
    await expect(adapter?.exchange(exchangeInput)).resolves.toMatchObject({ subject: "g-1" });
    const before = keySets;
    await adapter?.exchange(exchangeInput);
    expect(keySets).toBe(before);
  });
});

describe("Microsoft", () => {
  const claims = (over: Record<string, unknown> = {}) => ({
    iss: `https://login.microsoftonline.com/${TID}/v2.0`,
    aud: "client-123",
    sub: "m-1",
    tid: TID,
    nonce: NONCE,
    email: "ada@example.rw",
    name: "Ada Uwase",
    ...over,
  });
  const exchange = async (token: string, settings: OAuthSettings = SETTINGS) => {
    const net = fakeNet({
      "https://login.microsoftonline.com/": (init) =>
        init?.method === "POST" ? { id_token: token } : jwks(),
    });
    return (
      createProviders(settings, net.fetchFn).get("microsoft")?.exchange(exchangeInput) ??
      Promise.reject(new Error("none"))
    );
  };

  it("never treats the email as verified", async () => {
    await expect(exchange(await idToken(claims()))).resolves.toMatchObject({
      provider: "microsoft",
      subject: "m-1",
      emailVerified: false,
    });
  });

  it("accepts any tenant with 'common' but requires the issuer to match the signed tenant id", async () => {
    expect(
      (
        await rejected(
          exchange(await idToken(claims({ tid: "11111111-1111-1111-1111-111111111111" }))),
        )
      ).code,
    ).toBe("invalid_token");
    expect(
      (
        await rejected(
          exchange(
            await idToken(claims({ iss: "https://login.microsoftonline.com.evil.example/x/v2.0" })),
          ),
        )
      ).code,
    ).toBe("invalid_token");
    expect(
      (await rejected(exchange(await idToken(claims({ iss: `https://sts.windows.net/${TID}/` })))))
        .code,
    ).toBe("invalid_token");
  });

  it("pins a specific tenant when one is configured", async () => {
    const pinned = { ...SETTINGS, microsoftTenant: "22222222-2222-2222-2222-222222222222" };
    expect((await rejected(exchange(await idToken(claims()), pinned))).code).toBe("invalid_token");
  });
});

describe("LinkedIn", () => {
  it("verifies the id_token and reads the verified email", async () => {
    const token = await idToken({
      iss: "https://www.linkedin.com/oauth",
      aud: "client-123",
      sub: "l-1",
      nonce: NONCE,
      email: "ada@example.rw",
      email_verified: true,
      name: "Ada",
    });
    const net = fakeNet({
      "https://www.linkedin.com/oauth/v2/accessToken": () => ({ id_token: token }),
      "https://www.linkedin.com/oauth/openid/jwks": jwks,
    });
    const profile = await createProviders(SETTINGS, net.fetchFn)
      .get("linkedin")
      ?.exchange(exchangeInput);
    expect(profile).toMatchObject({
      provider: "linkedin",
      subject: "l-1",
      email: "ada@example.rw",
      emailVerified: true,
    });
    expect((net.calls[0]?.init?.body as URLSearchParams).toString()).not.toContain("code_verifier");
  });
});

describe("GitHub", () => {
  const net = (emails: object, user: object = { id: 4242, login: "ada", name: null }) =>
    fakeNet({
      "https://github.com/login/oauth/access_token": () => ({ access_token: "gho_token" }),
      "https://api.github.com/user/emails": () => emails,
      "https://api.github.com/user": () => user,
    });
  const exchange = (n: ReturnType<typeof net>) =>
    createProviders(SETTINGS, n.fetchFn).get("github")?.exchange(exchangeInput) ??
    Promise.reject(new Error("none"));

  it("uses the primary verified address and a numeric id as the stable subject", async () => {
    const n = net([
      { email: "old@example.rw", primary: false, verified: true },
      { email: "ada@example.rw", primary: true, verified: true },
      { email: "unverified@example.rw", primary: false, verified: false },
    ]);
    await expect(exchange(n)).resolves.toEqual({
      provider: "github",
      subject: "4242",
      email: "ada@example.rw",
      emailVerified: true,
      name: "ada",
    });
    expect(n.calls.find((c) => c.url.endsWith("/user"))?.init?.headers).toMatchObject({
      Authorization: "Bearer gho_token",
      "User-Agent": "mdl-sign-in",
    });
  });

  it("falls back to any verified address, and never to an unverified one", async () => {
    const some = await exchange(net([{ email: "x@example.rw", primary: false, verified: true }]));
    expect(some.email).toBe("x@example.rw");
    const none = await exchange(net([{ email: "x@example.rw", primary: true, verified: false }]));
    expect(none).toMatchObject({ email: undefined, emailVerified: false });
  });

  it("fails cleanly when GitHub returns no user id or no token", async () => {
    expect((await rejected(exchange(net([], {})))).code).toBe("profile_failed");
    const noToken = fakeNet({
      "https://github.com/login/oauth/access_token": () => ({ error: "bad_verification_code" }),
    });
    const err = await rejected(
      createProviders(SETTINGS, noToken.fetchFn).get("github")?.exchange(exchangeInput) ??
        Promise.resolve(),
    );
    expect(err.code).toBe("exchange_failed");
  });
});

describe("Facebook", () => {
  it("reads the profile with the versioned Graph API and never trusts the email", async () => {
    const n = fakeNet({
      "https://graph.facebook.com/v25.0/oauth/access_token": () => ({ access_token: "fb-token" }),
      "https://graph.facebook.com/v25.0/me": () => ({
        id: "fb-9",
        name: "Ada Uwase",
        email: "ada@example.rw",
      }),
    });
    const profile = await createProviders(SETTINGS, n.fetchFn)
      .get("facebook")
      ?.exchange(exchangeInput);
    expect(profile).toEqual({
      provider: "facebook",
      subject: "fb-9",
      email: "ada@example.rw",
      emailVerified: false,
      name: "Ada Uwase",
    });
    expect(n.calls[1]?.url).toContain("fields=id,name,email");
    expect(n.calls[1]?.url).not.toContain("fb-token");
    expect(n.calls[1]?.init?.headers).toMatchObject({ Authorization: "Bearer fb-token" });
  });

  it("copes with a person who has no email on Facebook", async () => {
    const n = fakeNet({
      "https://graph.facebook.com/v25.0/oauth/access_token": () => ({ access_token: "t" }),
      "https://graph.facebook.com/v25.0/me": () => ({ id: "fb-10", name: "No Email" }),
    });
    const profile = await createProviders(SETTINGS, n.fetchFn)
      .get("facebook")
      ?.exchange(exchangeInput);
    expect(profile?.email).toBeUndefined();
  });
});
