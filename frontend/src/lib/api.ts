/**
 * Typed client for the MDL API (backend/). Design rules (ADR-0004):
 *  - the session lives in an httpOnly cookie, so the client never sees or stores a token;
 *  - every call sends `credentials: "include"` and, for mutations, the custom CSRF header;
 *  - failures become a small closed set of results, never raw server text, so UI code cannot
 *    accidentally render something the server should not have sent.
 */

const BASE_URL: string = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";
const TIMEOUT_MS = 15_000;

export const PRIVACY_NOTICE_VERSION = "2026-11";

export type FieldProblem = { path: string; message: string };

export type ApiFailure =
  | { ok: false; reason: "validation"; problems: FieldProblem[] }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "rate_limited" | "invalid_token" }
  | { ok: false; reason: "invalid_credentials" | "account_not_active" }
  | { ok: false; reason: "network" | "unavailable" };

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface ErrorEnvelope {
  error?: { code?: string; details?: unknown };
}

function problemsOf(details: unknown): FieldProblem[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { path, message } = item as { path?: unknown; message?: unknown };
    return typeof path === "string" && typeof message === "string" ? [{ path, message }] : [];
  });
}

function failureFor(status: number, body: ErrorEnvelope): ApiFailure {
  const code = body.error?.code;
  if (status === 400 && code === "INVALID_TOKEN") return { ok: false, reason: "invalid_token" };
  if (status === 400)
    return { ok: false, reason: "validation", problems: problemsOf(body.error?.details) };
  if (status === 401 && code === "INVALID_CREDENTIALS")
    return { ok: false, reason: "invalid_credentials" };
  if (status === 401) return { ok: false, reason: "unauthenticated" };
  if (status === 403 && code === "ACCOUNT_NOT_ACTIVE")
    return { ok: false, reason: "account_not_active" };
  if (status === 403) return { ok: false, reason: "forbidden" };
  if (status === 429) return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "unavailable" };
}

export async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/api/v1${path}`, {
      method,
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        // A cross-site form cannot add this header, which is what the API checks (CSRF defence).
        ...(method === "GET" ? {} : { "X-Requested-With": "mdl-web" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.ok) {
      const data: unknown =
        response.status === 204 ? undefined : await response.json().catch(() => undefined);
      return { ok: true, data: data as T };
    }
    const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
    return failureFor(response.status, envelope);
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  ageBracket: "under_16" | "16_plus";
  guardianEmail?: string;
  consent: true;
  privacyNoticeVersion: string;
}

export interface Profile {
  email: string;
  displayName: string;
  roles: string[];
  ageBracket: "under_16" | "16_plus";
  emailVerified: boolean;
  guardianConsentRecorded: boolean;
}

export const api = {
  leads: {
    submit: (payload: Record<string, unknown>) =>
      request<{ status: string }>("POST", "/leads", payload),
  },
  auth: {
    register: (input: RegisterInput) =>
      request<{ status: string }>("POST", "/auth/register", input),
    verifyEmail: (token: string) =>
      request<{ status: string }>("POST", "/auth/verify-email", { token }),
    confirmGuardian: (token: string) =>
      request<{ status: string }>("POST", "/auth/guardian/confirm", { token }),
    login: (email: string, password: string) =>
      request<{ status: string }>("POST", "/auth/login", { email, password }),
    logout: () => request<undefined>("POST", "/auth/logout", {}),
    forgotPassword: (email: string) =>
      request<{ status: string }>("POST", "/auth/password/forgot", { email }),
    resetPassword: (token: string, password: string) =>
      request<{ status: string }>("POST", "/auth/password/reset", { token, password }),
  },
  users: {
    me: () => request<{ user: Profile }>("GET", "/users/me"),
    setMarketingConsent: (granted: boolean) =>
      request<undefined>("PUT", "/users/me/consents/marketing", {
        granted,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      }),
    exportData: () => request<unknown>("GET", "/users/me/export"),
    deleteAccount: (password: string) => request<undefined>("DELETE", "/users/me", { password }),
  },
};
