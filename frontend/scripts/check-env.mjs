// Runs before every build (npm "prebuild"). Stops a production build that would deploy a site that cannot work,
// and says plainly which mode and API setup this build has. Pure function `checkEnv` is unit-tested.
import { pathToFileURL } from "node:url";

const LOCAL = /(^|\/\/|@)(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1?\])(:|\/|$)/i;

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ errors: string[]; warnings: string[]; summary: string }}
 */
export function checkEnv(env) {
  const errors = [];
  const warnings = [];
  const apiBase = (env["VITE_API_BASE_URL"] ?? "").trim();
  const proxy = (env["API_PROXY_TARGET"] ?? "").trim();
  const onVercel = env["VERCEL"] === "1" || env["VERCEL"] === "true";
  const vercelEnv = env["VERCEL_ENV"]; // production | preview | development
  const production =
    vercelEnv === "production" || (vercelEnv === undefined && env["NODE_ENV"] === "production");
  const mode = onVercel
    ? `vercel ${vercelEnv ?? "build"}`
    : production
      ? "production"
      : "development/ci";

  if (proxy !== "") {
    if (!/^https:\/\/[^/\s]+$/i.test(proxy)) {
      errors.push(
        `API_PROXY_TARGET must be an https address with no path or trailing slash, for example https://api.example.com (got "${proxy}").`,
      );
    } else if (LOCAL.test(proxy)) {
      errors.push(
        `API_PROXY_TARGET points at this computer ("${proxy}"). A deployed site cannot reach it.`,
      );
    }
  }
  if (apiBase !== "" && proxy !== "") {
    errors.push(
      "Set either VITE_API_BASE_URL (browser talks to the API directly) or API_PROXY_TARGET (the site forwards /api to the API), not both.",
    );
  }
  if (production && apiBase !== "" && LOCAL.test(apiBase)) {
    errors.push(
      `VITE_API_BASE_URL points at this computer ("${apiBase}") in a production build. Remove it, or set it to the public API address.`,
    );
  }
  if (production && apiBase !== "" && !LOCAL.test(apiBase)) {
    warnings.push(
      "VITE_API_BASE_URL is an absolute address: the session cookie is then set by another site and many browsers block it. Prefer API_PROXY_TARGET.",
    );
  }
  if (onVercel && apiBase === "" && proxy === "") {
    errors.push(
      "Neither API_PROXY_TARGET nor VITE_API_BASE_URL is set. On Vercel the site would call /api/v1 and get 404. Set API_PROXY_TARGET to the API address (for example https://mindsdigitallegacyserver.onrender.com).",
    );
  }

  const api =
    proxy !== ""
      ? `proxied to ${proxy}`
      : apiBase !== ""
        ? `direct to ${apiBase}`
        : "same origin (no proxy configured)";
  return { errors, warnings, summary: `mode: ${mode}; API: ${api}` };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors, warnings, summary } = checkEnv(process.env);
  console.log(`[check-env] ${summary}`);
  for (const w of warnings) console.warn(`[check-env] WARNING: ${w}`);
  for (const e of errors) console.error(`[check-env] ERROR: ${e}`);
  if (errors.length > 0) {
    console.error(
      "[check-env] Build stopped. Fix the settings above (Vercel: Project > Settings > Environment Variables).",
    );
    process.exit(1);
  }
}
