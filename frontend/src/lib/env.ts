/**
 * Which mode this copy of the site is running in, and how it reaches the API. One place to ask, so nothing
 * guesses. `import.meta.env.PROD` is true only in a production build; `vite dev` is always development.
 *
 * How the browser reaches the API:
 *  - development: VITE_API_BASE_URL=http://localhost:4000 (same site as http://localhost:3000, so cookies work);
 *  - production on Vercel: VITE_API_BASE_URL is empty and the site forwards /api to the API (API_PROXY_TARGET),
 *    so the browser only talks to the website's own address and the session cookie is first-party.
 */
export const IS_PRODUCTION: boolean = import.meta.env.PROD === true;
export const APP_MODE: "production" | "development" = IS_PRODUCTION ? "production" : "development";
export const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";
export const API_IS_SAME_ORIGIN: boolean = API_BASE_URL === "";

/** One plain sentence for the browser console, so a developer or support person can see the setup at a glance. */
export function describeSetup(origin: string): string {
  const api = API_IS_SAME_ORIGIN
    ? `same origin (${origin}/api, forwarded to the API)`
    : API_BASE_URL;
  return `mode: ${APP_MODE}; API: ${api}`;
}

/** Warnings about setups that look fine but fail in real browsers. Empty means nothing to worry about. */
export function setupWarnings(origin: string): string[] {
  const out: string[] = [];
  if (IS_PRODUCTION && /localhost|127\.0\.0\.1/.test(API_BASE_URL)) {
    out.push(
      "This production site is configured to call an API on localhost. It cannot work for visitors.",
    );
  }
  if (IS_PRODUCTION && !API_IS_SAME_ORIGIN) {
    try {
      const apiHost = new URL(API_BASE_URL).hostname;
      const siteHost = new URL(origin).hostname;
      const root = (h: string): string => h.split(".").slice(-2).join(".");
      if (root(apiHost) !== root(siteHost)) {
        out.push(
          "The API is on a different site from this page. Browsers may block the sign-in cookie. Use the same-origin /api proxy instead.",
        );
      }
    } catch {
      /* an unparsable address is reported by the server, not here */
    }
  }
  return out;
}
