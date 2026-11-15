import { z } from "zod";
import { MAX_PAGE_SIZE } from "../../core/page.js";
import type { User } from "../users/users.types.js";

export const pageQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
};

/** Query-string booleans arrive as text. */
export const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
export const isoDate = z.coerce.date();
export const objectIdLike = z.string().trim().min(1).max(40);

/** What staff see of an account. Explicit allow-list: no password hash, no second-factor secret. */
export function adminUserDto(u: User) {
  const state = u.deletedAt
    ? "deleted"
    : u.suspendedAt
      ? "suspended"
      : u.emailVerifiedAt
        ? "active"
        : "unverified";
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    phone: u.phone,
    roles: u.roles,
    state,
    ageBracket: u.ageBracket,
    emailVerifiedAt: u.emailVerifiedAt?.toISOString(),
    guardian:
      u.guardian === undefined
        ? undefined
        : { email: u.guardian.email, consentAt: u.guardian.consentAt?.toISOString() },
    suspendedAt: u.suspendedAt?.toISOString(),
    suspendedReason: u.suspendedReason,
    lockedUntil: u.lockedUntil?.toISOString(),
    failedLogins: u.failedLogins,
    mfaEnabled: u.totp?.enabledAt !== undefined,
    createdAt: u.createdAt.toISOString(),
    deletedAt: u.deletedAt?.toISOString(),
  };
}

type Cell = string | number | boolean | Date | null | undefined;

/**
 * CSV for spreadsheets. Cells that start with = + - @ (or a tab/CR) are prefixed with an apostrophe so a
 * hostile value such as =HYPERLINK(...) typed into a public form cannot run as a formula when staff open the export.
 */
export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell): string => {
    if (v === undefined || v === null) return "";
    let text = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Flat "path: before -> after" lines for the audit trail of a settings change. Arrays are summarised, never dumped. */
export function diffObjects(before: unknown, after: unknown, path = ""): string[] {
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [];
    const b = Array.isArray(after) ? after : [];
    return JSON.stringify(a) === JSON.stringify(b)
      ? []
      : [`${path}: ${a.length} -> ${b.length} items`];
  }
  if (
    typeof before === "object" &&
    before !== null &&
    typeof after === "object" &&
    after !== null
  ) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((k) =>
      diffObjects(
        (before as Record<string, unknown>)[k],
        (after as Record<string, unknown>)[k],
        path === "" ? k : `${path}.${k}`,
      ),
    );
  }
  return before === after ? [] : [`${path}: ${String(before)} -> ${String(after)}`];
}
