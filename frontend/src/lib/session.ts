import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Profile } from "./api";

export type Session =
  { status: "loading" } | { status: "anonymous" } | { status: "authenticated"; user: Profile };

const ME_KEY = ["me"] as const;

/**
 * Current user, read from the API with the httpOnly cookie (the browser never sees the session id).
 * Runs only in the browser: on the server there is no cookie to send, so the first paint is always
 * "loading" and server and client markup match.
 */
export function useSession(): Session {
  const query = useQuery({
    queryKey: ME_KEY,
    enabled: typeof window !== "undefined",
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<Profile | null> => {
      const result = await api.users.me();
      if (result.ok) return result.data.user;
      if (result.reason === "unauthenticated") return null;
      throw new Error(result.reason);
    },
  });
  if (query.isPending) return { status: "loading" };
  if (query.data) return { status: "authenticated", user: query.data };
  return { status: "anonymous" };
}

export function useRefreshSession(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ME_KEY });
}

export function useClearSession(): () => void {
  const client = useQueryClient();
  return () => client.setQueryData(ME_KEY, null);
}
