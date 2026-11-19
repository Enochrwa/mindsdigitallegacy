/** The sign-in providers MDL can offer. A provider appears on the site only when its keys are configured. */
export const PROVIDER_IDS = ["google", "microsoft", "github", "facebook", "linkedin"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  google: "Google",
  microsoft: "Microsoft",
  github: "GitHub",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);

/** Who the provider says the person is. Only what MDL needs; nothing else is requested or kept. */
export interface IdentityProfile {
  provider: ProviderId;
  /** The provider's stable id for this person (never the email: emails change and can be reassigned). */
  subject: string;
  email?: string | undefined;
  /** True only when the provider itself vouches that the person controls the email address. */
  emailVerified: boolean;
  name: string;
}

export interface AuthorizeParams {
  state: string;
  nonce: string;
  challenge: string;
  redirectUri: string;
}

export interface ExchangeInput {
  code: string;
  verifier: string;
  redirectUri: string;
  nonce: string;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  /** Builds the provider's sign-in page address. */
  authorizeUrl(params: AuthorizeParams): string;
  /** Trades the one-time code for the person's identity. Throws ProviderError on any problem. */
  exchange(input: ExchangeInput): Promise<IdentityProfile>;
}

/** Why a provider step failed. Only these codes ever reach the visitor; provider text never does. */
export type ProviderErrorCode =
  "exchange_failed" | "invalid_token" | "profile_failed" | "email_missing";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ProviderKeys {
  clientId: string;
  clientSecret: string;
}

export interface OAuthSettings {
  google?: ProviderKeys | undefined;
  microsoft?: ProviderKeys | undefined;
  github?: ProviderKeys | undefined;
  facebook?: ProviderKeys | undefined;
  linkedin?: ProviderKeys | undefined;
  /** "common" accepts work, school and personal accounts; "organizations", "consumers" or a tenant id narrow it. */
  microsoftTenant: string;
  /** Facebook Graph API version, for example "v25.0". */
  facebookVersion: string;
}
