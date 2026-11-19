import { createLocalJWKSet, errors, jwtVerify } from "jose";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { ProviderError } from "./oauth.types.js";
import type { HttpFetch } from "./oauth.types.js";

/**
 * OpenID Connect id_token checks. Used for Google, Microsoft and LinkedIn.
 *
 * Even though the token arrives straight from the provider over TLS (which the OIDC spec accepts on its own),
 * we still verify the signature against the provider's published keys and check issuer, audience, expiry and
 * the nonce. Defence in depth costs one cached request an hour.
 */

const TIMEOUT_MS = 8000;
const MAX_BODY = 256 * 1024;
const JWKS_TTL_MS = 60 * 60 * 1000;

/** Reads a response body with a hard size cap so a hostile or broken server cannot exhaust memory. */
export async function readCapped(res: Response): Promise<string> {
  const text = await res.text();
  if (text.length > MAX_BODY) throw new ProviderError("exchange_failed", "response too large");
  return text;
}

export async function getJson(
  fetchFn: HttpFetch,
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
  const res = await fetchFn(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
  const text = await readCapped(res);
  if (!res.ok) throw new ProviderError("exchange_failed", `HTTP ${String(res.status)}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError("exchange_failed", "not JSON");
  }
}

export function createJwksCache(fetchFn: HttpFetch, now: () => number = Date.now) {
  const cache = new Map<string, { keys: JSONWebKeySet; at: number }>();
  return async (uri: string, force = false): Promise<JSONWebKeySet> => {
    const hit = cache.get(uri);
    if (!force && hit !== undefined && now() - hit.at < JWKS_TTL_MS) return hit.keys;
    const keys = (await getJson(fetchFn, uri)) as JSONWebKeySet;
    if (!Array.isArray(keys.keys)) throw new ProviderError("invalid_token", "bad key set");
    cache.set(uri, { keys, at: now() });
    return keys;
  };
}

export interface VerifyOptions {
  idToken: string;
  jwksUri: string;
  audience: string;
  nonce: string;
  /** Extra check on the signed claims (issuer rules that a fixed string cannot express). */
  accept: (claims: JWTPayload) => boolean;
  jwks: (uri: string, force?: boolean) => Promise<JSONWebKeySet>;
}

export async function verifyIdToken(o: VerifyOptions): Promise<JWTPayload> {
  const attempt = async (force: boolean): Promise<JWTPayload> => {
    const set = createLocalJWKSet(await o.jwks(o.jwksUri, force));
    const { payload } = await jwtVerify(o.idToken, set, {
      audience: o.audience,
      algorithms: ["RS256"],
      clockTolerance: 30,
    });
    return payload;
  };

  let claims: JWTPayload;
  try {
    try {
      claims = await attempt(false);
    } catch (err) {
      // The provider may have rotated its keys since we cached them: refresh once, then give up.
      if (err instanceof errors.JWKSNoMatchingKey) claims = await attempt(true);
      else throw err;
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError("invalid_token", "id_token rejected");
  }
  if (claims["nonce"] !== o.nonce) throw new ProviderError("invalid_token", "nonce mismatch");
  if (typeof claims.sub !== "string" || claims.sub === "") {
    throw new ProviderError("invalid_token", "missing subject");
  }
  if (!o.accept(claims)) throw new ProviderError("invalid_token", "issuer not accepted");
  return claims;
}
