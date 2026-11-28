/**
 * Security headers for HTML responses (Sprint 2, ADR-0005; reporting added in Sprint 5b).
 *
 * The CSP ships as Content-Security-Policy-Report-Only first, and violations are now sent to the API
 * (`POST /api/v1/csp-report`), which logs a sanitised summary. Review a week of reports from the real
 * domain, fix what is legitimate, then enforce by building with VITE_CSP_ENFORCE=true: no code change.
 * 'unsafe-inline' for scripts is needed while the framework emits an inline bootstrap script; replacing
 * it with nonces is tracked in docs/10-sprint-backlog.md (C4 follow-up) because it needs a real-browser run.
 */
export const REPORT_PATH = "/api/v1/csp-report";

/** Enforcing is a deliberate build-time switch so the same code can run in report-only and enforcing mode. */
export function isEnforcing(
  flag: string | undefined = import.meta.env?.["VITE_CSP_ENFORCE"] as string | undefined,
): boolean {
  return flag === "true";
}

export function buildCsp(apiOrigin: string | undefined): string {
  const connect = ["'self'", ...(apiOrigin ? [apiOrigin] : [])];
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https://i.ytimg.com data:",
    "frame-src https://www.youtube-nocookie.com",
    `connect-src ${connect.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // `report-uri` for browsers without the Reporting API; `report-to` for those with it.
    // Same-origin (empty apiOrigin) when the site forwards /api to the API: the path alone is correct then.
    `report-uri ${apiOrigin ?? ""}${REPORT_PATH}`,
    "report-to csp",
  ].join("; ");
}

export function securityHeaders(
  apiOrigin: string | undefined,
  enforce: boolean = isEnforcing(),
): Record<string, string> {
  return {
    [enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]:
      buildCsp(apiOrigin),
    "Reporting-Endpoints": `csp="${apiOrigin ?? ""}${REPORT_PATH}"`,
    // Not "no-referrer": the YouTube embed needs an origin. Token pages set a stricter meta policy themselves.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}
