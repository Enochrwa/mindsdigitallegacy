import type { Env } from "../../config/env.js";
import type { OAuthSettings, ProviderKeys } from "./oauth.types.js";

/** In development without a configured key, a fixed, public one is used. It is refused in production by env.ts. */
export const DEV_STATE_KEY = "mdl-development-only-oauth-state-key-do-not-use!";

function keys(id: string | undefined, secret: string | undefined): ProviderKeys | undefined {
  return id !== undefined && secret !== undefined
    ? { clientId: id, clientSecret: secret }
    : undefined;
}

/** A provider is enabled exactly when both its client id and secret are set. */
export function oauthSettings(env: Env): OAuthSettings {
  return {
    google: keys(env.OAUTH_GOOGLE_CLIENT_ID, env.OAUTH_GOOGLE_CLIENT_SECRET),
    microsoft: keys(env.OAUTH_MICROSOFT_CLIENT_ID, env.OAUTH_MICROSOFT_CLIENT_SECRET),
    github: keys(env.OAUTH_GITHUB_CLIENT_ID, env.OAUTH_GITHUB_CLIENT_SECRET),
    facebook: keys(env.OAUTH_FACEBOOK_CLIENT_ID, env.OAUTH_FACEBOOK_CLIENT_SECRET),
    linkedin: keys(env.OAUTH_LINKEDIN_CLIENT_ID, env.OAUTH_LINKEDIN_CLIENT_SECRET),
    microsoftTenant: env.OAUTH_MICROSOFT_TENANT,
    facebookVersion: env.OAUTH_FACEBOOK_GRAPH_VERSION,
  };
}

export const apiPublicUrl = (env: Env): string =>
  env.API_PUBLIC_URL ?? `http://localhost:${String(env.PORT)}`;
export const stateKey = (env: Env): string => env.OAUTH_STATE_KEY ?? DEV_STATE_KEY;
