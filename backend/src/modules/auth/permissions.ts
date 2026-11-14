import type { Role } from "../users/users.types.js";

/**
 * Staff permissions. One table answers "who can do what" for the admin console, and the API checks
 * these, never role names, so adding a role (for example `supervisor` in Sprint 4) is a one-line change.
 * Deny by default: a permission nobody lists is granted to nobody, not even admin, unless admin has `*`.
 */
export const PERMISSIONS = [
  "admin:access",
  "analytics:read",
  "users:read",
  "users:manage",
  "roles:manage",
  "courses:read",
  "courses:write",
  "leads:read",
  "leads:write",
  "referrals:read",
  "referrals:review",
  "unlock:manage",
  "enrolments:read",
  "enrolments:manage",
  "settings:read",
  "settings:manage",
  "audit:read",
  "export:data",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const BY_ROLE: Partial<Record<Role, readonly Permission[]>> = {
  admin: PERMISSIONS,
  editor: ["admin:access", "analytics:read", "courses:read", "courses:write"],
  support: [
    "admin:access",
    "analytics:read",
    "users:read",
    "leads:read",
    "leads:write",
    "referrals:read",
    "referrals:review",
    "enrolments:read",
  ],
};

export function permissionsOf(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of BY_ROLE[role] ?? []) out.add(p);
  return out;
}

export const can = (roles: readonly Role[], permission: Permission): boolean =>
  permissionsOf(roles).has(permission);

/** Roles that reach the admin console and therefore must use a second factor. */
export const isStaff = (roles: readonly Role[]): boolean => can(roles, "admin:access");
