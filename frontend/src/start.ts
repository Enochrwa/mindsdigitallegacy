import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { securityHeaders } from "./lib/security-headers";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const API_ORIGIN = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) || undefined;

const headersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  // Only documents need these; API-style responses from server functions are unaffected by CSP.
  try {
    for (const [name, value] of Object.entries(securityHeaders(API_ORIGIN))) {
      if (!result.response.headers.has(name)) result.response.headers.set(name, value);
    }
  } catch {
    // Immutable response (for example a passed-through redirect): leave it as it is.
  }
  return result;
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// requestMiddleware runs on every request; functionMiddleware only on server functions, where
// client sendContext is unvalidated input. Append to these arrays, never replace them.
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, headersMiddleware, csrfMiddleware],
}));
