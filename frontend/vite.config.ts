import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";

/**
 * Where the production build is meant to run, chosen from the environment so nothing needs editing per host:
 *  - on Vercel (it sets VERCEL=1) the "vercel" preset, which produces the server function and static files Vercel serves;
 *  - anywhere else the Cloudflare module preset recorded in ADR-0007;
 *  - NITRO_PRESET overrides both (for example "node-server" for a plain Node host).
 * The dev server (`vite dev`) never uses any of this.
 */
const BUILD_PRESET =
  process.env["NITRO_PRESET"] ?? (process.env["VERCEL"] ? "vercel" : "cloudflare-module");

/**
 * Optional same-origin API proxy. When API_PROXY_TARGET is set at build time (for example the Render address),
 * every request to `/api/...` on the website is forwarded to the API. The browser then only ever talks to the
 * website's own address, so the session cookie is first-party and sign-in works in every browser (a cookie set by a
 * different site, such as onrender.com while the site is on vercel.app, is blocked or dropped by many browsers).
 */
const API_PROXY_TARGET = (process.env["API_PROXY_TARGET"] ?? "").replace(/\/+$/, "");

// Explicit plugin order matters: tanstackStart before nitro before react.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
  );

  return {
    define,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: { host: "::", port: 3000 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Use src/server.ts (our SSR error wrapper) as the server entry.
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      // Build only (see BUILD_PRESET above). Cloudflare stays the default target (ADR-0007); Vercel is detected.
      ...(command === "build"
        ? [
            nitro({
              preset: BUILD_PRESET,
              ...(API_PROXY_TARGET === ""
                ? {}
                : { routeRules: { "/api/**": { proxy: `${API_PROXY_TARGET}/api/**` } } }),
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
