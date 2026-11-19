/**
 * Sign in with Google, Microsoft, GitHub, Facebook or LinkedIn. The browser is sent to the API, which sends it
 * to the provider and brings it back; this file only builds addresses, asks the API a few questions, and words
 * the fixed error codes the API returns. Provider text is never shown, because the API never forwards it.
 */
import { useQuery } from "@tanstack/react-query";
import { BASE_URL, request } from "./api";

export const PROVIDER_IDS = ["google", "microsoft", "github", "facebook", "linkedin"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  google: "Google",
  microsoft: "Microsoft",
  github: "GitHub",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

export const isProviderId = (v: unknown): v is ProviderId =>
  typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);

export interface EnabledProvider {
  id: ProviderId;
  label: string;
}

export interface Pending {
  provider: ProviderId;
  label: string;
  email: string;
  name: string;
  needsCode: boolean;
  codeSent: boolean;
}

export interface LinkedAccount {
  provider: ProviderId;
  label: string;
  email?: string;
  connectedAt: string;
}

/** Only a same-site path may follow a sign-in. The API checks again; this just avoids sending nonsense. */
export function safeNext(raw: string | undefined): string | undefined {
  if (raw === undefined || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\"))
    return undefined;
  return raw.length > 200 ? undefined : raw;
}

/** Where the browser goes to start signing in. A full page navigation, not a fetch: the provider takes over. */
export function startUrl(provider: ProviderId, next?: string): string {
  const safe = safeNext(next);
  const query = safe === undefined ? "" : `?next=${encodeURIComponent(safe)}`;
  return `${BASE_URL}/api/v1/auth/oauth/${provider}/start${query}`;
}

export const KEYS = {
  providers: ["oauth", "providers"] as const,
  pending: ["oauth", "pending"] as const,
  linked: ["oauth", "linked"] as const,
};

export const oauthApi = {
  providers: () => request<{ providers: EnabledProvider[] }>("GET", "/auth/oauth/providers"),
  pending: () => request<{ pending: Pending | null }>("GET", "/auth/oauth/pending"),
  complete: (input: {
    ageBracket: "under_16" | "16_plus";
    guardianEmail?: string;
    consent: true;
    privacyNoticeVersion: string;
    referralCode?: string;
  }) =>
    request<{ status: "signed_in" | "guardian_pending" | "code_sent"; email?: string }>(
      "POST",
      "/auth/oauth/complete",
      input,
    ),
  confirmCode: (code: string) =>
    request<{ status: "signed_in" | "guardian_pending" }>("POST", "/auth/oauth/confirm-code", {
      code,
    }),
  linked: () =>
    request<{ hasPassword: boolean; identities: LinkedAccount[] }>("GET", "/auth/oauth/identities"),
  link: (provider: ProviderId) =>
    request<{ url: string }>("POST", `/auth/oauth/${provider}/link`, {}),
  unlink: (provider: ProviderId) =>
    request<undefined>("DELETE", `/auth/oauth/identities/${provider}`),
};

/** Providers switched on in this deployment. Empty while loading or if the API cannot be reached. */
export function useProviders(): EnabledProvider[] {
  const query = useQuery({
    queryKey: KEYS.providers,
    enabled: typeof window !== "undefined",
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const r = await oauthApi.providers();
      return r.ok ? r.data.providers.filter((p) => isProviderId(p.id)) : [];
    },
  });
  return query.data ?? [];
}

const FAILURE: Record<string, string> = {
  denied: "You cancelled the sign-in. You can try again, or use your email and password.",
  failed: "We could not complete the sign-in. Please try again.",
  expired: "The sign-in took too long or was interrupted. Please try again.",
  unavailable: "We could not reach the sign-in provider. Please try again in a moment.",
  email_missing:
    "That account did not share an email address with us, so we cannot create your profile. Use another sign-in method.",
  account_exists:
    "An account with that email already exists. Sign in with your email and password, then connect the provider from My account.",
  identity_in_use: "That account is already connected to a different MDL profile.",
  inactive:
    "Your account is not active yet. Open the verification link we emailed you. If you are under 16, your parent or guardian must also confirm.",
  paused: "New sign-ups are paused for a short while. Please try again later.",
};

/** Words for the `?error=oauth_xxx` (sign in) or `?oauth_error=xxx` (connecting) code in the address. */
export function failureWording(code: string | undefined): string | null {
  if (code === undefined) return null;
  const key = code.startsWith("oauth_") ? code.slice(6) : code;
  return FAILURE[key] ?? (code.startsWith("oauth_") ? (FAILURE["failed"] ?? null) : null);
}

/** What to say when finishing sign-up fails. `code` is the API's error code. */
export function completeFailureWording(code: string | undefined, reason: string): string {
  switch (code) {
    case "SIGNUP_EXPIRED":
      return "Your sign-up took too long. Please start again.";
    case "ACCOUNT_EXISTS":
      return "An account with this email already exists. Sign in with your email and password, then connect the provider from My account.";
    case "IDENTITY_IN_USE":
      return "This account is already registered. Try signing in.";
    case "INVALID_CODE":
      return "That code is not right. Check your email and try again.";
    case "CODE_NOT_SENT":
      return "Ask for a code first.";
    case "REGISTRATION_CLOSED":
      return "New sign-ups are paused for a short while. Please try again later.";
    default:
      break;
  }
  if (reason === "rate_limited") return "Too many attempts. Please wait a little and try again.";
  if (reason === "network")
    return "We could not reach the server. Check your connection and try again.";
  return "We could not finish your sign-up. Please try again.";
}
