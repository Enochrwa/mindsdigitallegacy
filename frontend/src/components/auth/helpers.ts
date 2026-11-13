import type { FieldProblem } from "@/lib/api";

export const inputClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/30";

/** Head metadata shared by account pages: not indexed, and no Referer so token links cannot leak. */
export const authHead = (title: string) => () => ({
  meta: [
    { title: `${title} | Minds Digital Legacy` },
    { name: "robots", content: "noindex, nofollow" },
    { name: "referrer", content: "no-referrer" },
  ],
});

/** Server-reported field problems keyed by field path, for display next to the right input. */
export function problemMap(problems: FieldProblem[]): Record<string, string> {
  return Object.fromEntries(problems.map((p) => [p.path, p.message]));
}

export const PASSWORD_HINT =
  "At least 10 characters. A few random words make a strong password. Avoid your name, email and common passwords.";

/** Generic failure copy. Account-specific outcomes are handled by each screen. */
export function failureText(reason: string): string {
  switch (reason) {
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "network":
      return "We could not reach our servers. Check your connection and try again.";
    case "invalid_token":
      return "This link is invalid or has expired. Request a new one.";
    default:
      return "Something went wrong. Please try again.";
  }
}
