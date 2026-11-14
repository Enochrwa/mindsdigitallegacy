/**
 * Security headers for HTML responses (Sprint 2, ADR-0005).
 *
 * The CSP ships as Content-Security-Policy-Report-Only first: violations show in the browser console
 * and nothing breaks while we learn what the real app loads. Enforce it (change REPORT_ONLY) once a
 * production-domain run is clean. 'unsafe-inline' for scripts is needed while the framework emits an
 * inline bootstrap script; replacing it with nonces is tracked in the sprint plan.
 */
export const REPORT_ONLY = true;

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
  ].join("; ");
}

export function securityHeaders(apiOrigin: string | undefined): Record<string, string> {
  return {
    [REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy"]:
      buildCsp(apiOrigin),
    // Not "no-referrer": the YouTube embed needs an origin. Token pages set a stricter meta policy themselves.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}
