/**
 * CSP violation reports (Sprint 5b, C4). Browsers POST these when the page loads something the policy
 * does not allow. Reports come from the open internet, so the handler is deliberately minimal:
 * size-capped, rate-limited, never stored, and reduced to a few short facts before it is logged.
 * Nothing that could identify a visitor is kept: no query strings, no fragments, no page text,
 * no script samples, no IP address, no user agent.
 */

export interface CspFinding {
  directive: string;
  /** Origin of the blocked resource, or a keyword such as "inline", "eval", "data". */
  blocked: string;
  /** Path of the page (no query string or fragment). */
  page: string;
  disposition: "report" | "enforce";
}

const MAX = 120;
const KEYWORDS = new Set([
  "inline",
  "eval",
  "data",
  "blob",
  "self",
  "wasm-eval",
  "trusted-types-policy",
]);

/** Drops control characters (log-injection guard) and cuts the value to a short, fixed length. */
const clip = (value: unknown): string =>
  typeof value === "string"
    ? [...value]
        .filter((ch) => {
          const code = ch.charCodeAt(0);
          return code > 31 && code !== 127;
        })
        .join("")
        .slice(0, MAX)
    : "";

/** Keeps scheme, host and port of a URL. Non-URL keywords pass through; anything else becomes "other". */
export function originOf(value: unknown): string {
  const raw = clip(value);
  if (raw === "") return "";
  if (KEYWORDS.has(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.origin === "null" ? url.protocol.replace(":", "") : url.origin;
  } catch {
    return "other";
  }
}

function pathOf(value: unknown): string {
  const raw = clip(value);
  if (raw === "") return "";
  try {
    return new URL(raw).pathname.slice(0, 80);
  } catch {
    return "other";
  }
}

function disposition(value: unknown): "report" | "enforce" {
  return value === "enforce" ? "enforce" : "report";
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Accepts both wire formats and returns at most `limit` findings:
 *  - legacy `report-uri`: `{ "csp-report": { "violated-directive": ..., "blocked-uri": ... } }`
 *  - Reporting API: `[ { "type": "csp-violation", "body": { "effectiveDirective": ... } } ]`
 * Anything else yields an empty list.
 */
export function parseReports(body: unknown, limit = 10): CspFinding[] {
  const out: CspFinding[] = [];
  const push = (f: CspFinding): void => {
    if (f.directive !== "" && out.length < limit) out.push(f);
  };

  if (isObj(body) && isObj(body["csp-report"])) {
    const r = body["csp-report"];
    push({
      directive: clip(r["effective-directive"] ?? r["violated-directive"]).split(" ")[0] ?? "",
      blocked: originOf(r["blocked-uri"]),
      page: pathOf(r["document-uri"]),
      disposition: disposition(r["disposition"]),
    });
  } else if (Array.isArray(body)) {
    for (const item of body.slice(0, limit)) {
      if (!isObj(item) || item["type"] !== "csp-violation" || !isObj(item["body"])) continue;
      const r = item["body"];
      push({
        directive: clip(r["effectiveDirective"] ?? r["violatedDirective"]).split(" ")[0] ?? "",
        blocked: originOf(r["blockedURL"]),
        page: pathOf(r["documentURL"]),
        disposition: disposition(r["disposition"]),
      });
    }
  }
  return out;
}

/**
 * Logs each distinct (directive, blocked, page, disposition) at most once per window, so a noisy page
 * or a hostile sender cannot flood the logs. The memory is bounded; when full it forgets the oldest.
 */
export function createDeduper(windowMs: number, maxKeys = 500, now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return (f: CspFinding): boolean => {
    const key = `${f.directive}|${f.blocked}|${f.page}|${f.disposition}`;
    const t = now();
    const last = seen.get(key);
    if (last !== undefined && t - last < windowMs) return false;
    seen.delete(key);
    seen.set(key, t);
    if (seen.size > maxKeys) {
      const oldest = seen.keys().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    return true;
  };
}
