import { getJson, createJwksCache, verifyIdToken } from "./oidc.js";
import type { JWTPayload } from "jose";
import { PROVIDER_LABEL, ProviderError } from "./oauth.types.js";
import type {
  AuthorizeParams,
  ExchangeInput,
  HttpFetch,
  IdentityProfile,
  OAuthSettings,
  ProviderAdapter,
  ProviderId,
  ProviderKeys,
} from "./oauth.types.js";

const form = (fields: Record<string, string>): URLSearchParams => new URLSearchParams(fields);

async function postForm(
  fetchFn: HttpFetch,
  url: string,
  fields: Record<string, string>,
): Promise<Record<string, unknown>> {
  const json = await getJson(fetchFn, url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form(fields),
  });
  if (typeof json !== "object" || json === null)
    throw new ProviderError("exchange_failed", "bad token response");
  return json as Record<string, unknown>;
}

const bearer = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
});

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

function accessToken(body: Record<string, unknown>): string {
  const token = str(body["access_token"]);
  if (token === undefined) throw new ProviderError("exchange_failed", "no access token");
  return token;
}

// ------------------------------------------------------------------ OIDC providers

interface OidcSpec {
  id: ProviderId;
  keys: ProviderKeys;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUri: string;
  scope: string;
  /** Google and Microsoft accept PKCE; see docs/11 for why the others do not use it. */
  pkce: boolean;
  accept: (claims: JWTPayload) => boolean;
  profile: (claims: JWTPayload) => Omit<IdentityProfile, "provider" | "subject">;
  extraAuthorize?: Record<string, string>;
}

function oidcProvider(
  spec: OidcSpec,
  fetchFn: HttpFetch,
  jwks: ReturnType<typeof createJwksCache>,
): ProviderAdapter {
  return {
    id: spec.id,
    label: PROVIDER_LABEL[spec.id],
    authorizeUrl(p: AuthorizeParams) {
      const q = new URLSearchParams({
        client_id: spec.keys.clientId,
        redirect_uri: p.redirectUri,
        response_type: "code",
        scope: spec.scope,
        state: p.state,
        nonce: p.nonce,
        ...spec.extraAuthorize,
        ...(spec.pkce ? { code_challenge: p.challenge, code_challenge_method: "S256" } : {}),
      });
      return `${spec.authorizeUrl}?${q.toString()}`;
    },
    async exchange(input: ExchangeInput) {
      const body = await postForm(fetchFn, spec.tokenUrl, {
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: spec.keys.clientId,
        client_secret: spec.keys.clientSecret,
        ...(spec.pkce ? { code_verifier: input.verifier } : {}),
      });
      const idToken = str(body["id_token"]);
      if (idToken === undefined) throw new ProviderError("exchange_failed", "no id_token");
      const claims = await verifyIdToken({
        idToken,
        jwksUri: spec.jwksUri,
        audience: spec.keys.clientId,
        nonce: input.nonce,
        accept: spec.accept,
        jwks,
      });
      return { provider: spec.id, subject: String(claims.sub), ...spec.profile(claims) };
    },
  };
}

/** Google writes `email_verified` as a boolean, and some older libraries as the text "true". */
const truthy = (v: unknown): boolean => v === true || v === "true";

const MS_ISSUER = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0$/i;

// ------------------------------------------------------------------ the registry

export function createProviders(
  settings: OAuthSettings,
  fetchFn: HttpFetch = (url, init) => fetch(url, init),
): Map<ProviderId, ProviderAdapter> {
  const providers = new Map<ProviderId, ProviderAdapter>();
  const jwks = createJwksCache(fetchFn);

  if (settings.google) {
    providers.set(
      "google",
      oidcProvider(
        {
          id: "google",
          keys: settings.google,
          authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUrl: "https://oauth2.googleapis.com/token",
          jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
          scope: "openid email profile",
          pkce: true,
          extraAuthorize: { prompt: "select_account" },
          accept: (c) => c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com",
          profile: (c) => ({
            email: str(c["email"]),
            emailVerified: truthy(c["email_verified"]) && str(c["email"]) !== undefined,
            name: str(c["name"]) ?? str(c["email"]) ?? "Google user",
          }),
        },
        fetchFn,
        jwks,
      ),
    );
  }

  if (settings.microsoft) {
    const tenant = settings.microsoftTenant;
    const base = `https://login.microsoftonline.com/${tenant}`;
    providers.set(
      "microsoft",
      oidcProvider(
        {
          id: "microsoft",
          keys: settings.microsoft,
          authorizeUrl: `${base}/oauth2/v2.0/authorize`,
          tokenUrl: `${base}/oauth2/v2.0/token`,
          jwksUri: `${base}/discovery/v2.0/keys`,
          scope: "openid email profile",
          pkce: true,
          extraAuthorize: { prompt: "select_account", response_mode: "query" },
          // With "common" the issuer carries the person's own tenant id, so check its shape and that it
          // agrees with the signed `tid` claim. A fixed tenant must match exactly.
          accept: (c) => {
            const match = MS_ISSUER.exec(typeof c.iss === "string" ? c.iss : "");
            if (match === null) return false;
            const tid = str(c["tid"]);
            if (tid === undefined || tid.toLowerCase() !== match[1]?.toLowerCase()) return false;
            return !/^[0-9a-f-]{36}$/i.test(tenant) || tid.toLowerCase() === tenant.toLowerCase();
          },
          // Microsoft does not vouch for the `email` claim, so it is never trusted as verified (the
          // "nOAuth" class of account takeover). MDL asks the person to prove the mailbox instead.
          profile: (c) => ({
            email: str(c["email"]),
            emailVerified: false,
            name: str(c["name"]) ?? "Microsoft user",
          }),
        },
        fetchFn,
        jwks,
      ),
    );
  }

  if (settings.linkedin) {
    providers.set(
      "linkedin",
      oidcProvider(
        {
          id: "linkedin",
          keys: settings.linkedin,
          authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
          tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
          jwksUri: "https://www.linkedin.com/oauth/openid/jwks",
          scope: "openid profile email",
          pkce: false,
          accept: (c) => c.iss === "https://www.linkedin.com/oauth",
          profile: (c) => ({
            email: str(c["email"]),
            emailVerified: truthy(c["email_verified"]) && str(c["email"]) !== undefined,
            name: str(c["name"]) ?? "LinkedIn member",
          }),
        },
        fetchFn,
        jwks,
      ),
    );
  }

  if (settings.github) {
    const keys = settings.github;
    const gh = (token: string): Record<string, string> => ({
      ...bearer(token),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mdl-sign-in",
    });
    providers.set("github", {
      id: "github",
      label: PROVIDER_LABEL.github,
      authorizeUrl: (p) =>
        `https://github.com/login/oauth/authorize?${new URLSearchParams({
          client_id: keys.clientId,
          redirect_uri: p.redirectUri,
          scope: "read:user user:email",
          state: p.state,
          allow_signup: "true",
        }).toString()}`,
      async exchange(input) {
        const body = await postForm(fetchFn, "https://github.com/login/oauth/access_token", {
          client_id: keys.clientId,
          client_secret: keys.clientSecret,
          code: input.code,
          redirect_uri: input.redirectUri,
        });
        const token = accessToken(body);
        const user = (await getJson(fetchFn, "https://api.github.com/user", {
          headers: gh(token),
        })) as Record<string, unknown>;
        const id =
          typeof user["id"] === "number" || typeof user["id"] === "string"
            ? String(user["id"])
            : undefined;
        if (id === undefined) throw new ProviderError("profile_failed", "no user id");

        // The public profile email is often empty or unverified. Only a primary, verified address counts.
        const emails = await getJson(fetchFn, "https://api.github.com/user/emails", {
          headers: gh(token),
        });
        const list = Array.isArray(emails) ? (emails as Record<string, unknown>[]) : [];
        const verified = list.filter(
          (e) => e["verified"] === true && str(e["email"]) !== undefined,
        );
        const chosen = verified.find((e) => e["primary"] === true) ?? verified[0];
        const email = str(chosen?.["email"]);
        return {
          provider: "github",
          subject: id,
          email,
          emailVerified: email !== undefined,
          name: str(user["name"]) ?? str(user["login"]) ?? "GitHub user",
        };
      },
    });
  }

  if (settings.facebook) {
    const keys = settings.facebook;
    const v = settings.facebookVersion;
    providers.set("facebook", {
      id: "facebook",
      label: PROVIDER_LABEL.facebook,
      authorizeUrl: (p) =>
        `https://www.facebook.com/${v}/dialog/oauth?${new URLSearchParams({
          client_id: keys.clientId,
          redirect_uri: p.redirectUri,
          response_type: "code",
          scope: "public_profile,email",
          state: p.state,
        }).toString()}`,
      async exchange(input) {
        const body = await postForm(fetchFn, `https://graph.facebook.com/${v}/oauth/access_token`, {
          client_id: keys.clientId,
          client_secret: keys.clientSecret,
          code: input.code,
          redirect_uri: input.redirectUri,
        });
        const token = accessToken(body);
        const me = (await getJson(
          fetchFn,
          `https://graph.facebook.com/${v}/me?fields=id,name,email`,
          {
            headers: bearer(token),
          },
        )) as Record<string, unknown>;
        const id = str(me["id"]);
        if (id === undefined) throw new ProviderError("profile_failed", "no user id");
        // Facebook does not say whether the address is verified, so it is never treated as verified.
        return {
          provider: "facebook",
          subject: id,
          email: str(me["email"]),
          emailVerified: false,
          name: str(me["name"]) ?? "Facebook user",
        };
      },
    });
  }

  return providers;
}
