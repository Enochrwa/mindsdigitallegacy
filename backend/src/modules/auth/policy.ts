import type { Role } from "../users/users.types.js";

/**
 * Single authorisation policy, deny by default (LLD section 4). Route handlers never check roles
 * inline; they call `authorize`. Object-level rules (own data only) live here too, so each has one
 * place to read and one place to test.
 */
export type Action = "profile:read" | "profile:update" | "profile:export" | "profile:delete";

export interface Actor {
  id: string;
  roles: readonly Role[];
}

export interface Subject {
  ownerId: string;
}

const OWN_DATA_ACTIONS: ReadonlySet<Action> = new Set([
  "profile:read",
  "profile:update",
  "profile:export",
  "profile:delete",
]);

export function authorize(actor: Actor | undefined, action: Action, subject: Subject): boolean {
  if (actor === undefined) return false;
  if (OWN_DATA_ACTIONS.has(action)) return actor.id === subject.ownerId;
  return false;
}
