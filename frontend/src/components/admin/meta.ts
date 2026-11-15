import { createContext, useContext } from "react";
import type { AdminMeta } from "@/lib/admin";

export const AdminMetaContext = createContext<AdminMeta | null>(null);

/** Identity, permissions and menu of the signed-in staff member (only available inside the verified console). */
export function useMeta(): AdminMeta {
  const meta = useContext(AdminMetaContext);
  if (meta === null) throw new Error("useMeta must be used inside the admin console");
  return meta;
}

/** UI hint only: the server enforces every permission again on each request. */
export function useCan(permission: string): boolean {
  return useMeta().permissions.includes(permission);
}
