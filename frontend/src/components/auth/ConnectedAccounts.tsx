import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/auth/AuthShell";
import { ProviderIcon } from "@/components/auth/SocialButtons";
import {
  KEYS,
  PROVIDER_LABEL,
  failureWording,
  isProviderId,
  oauthApi,
  useProviders,
} from "@/lib/oauth";
import type { ProviderId } from "@/lib/oauth";

/**
 * "Sign-in methods" on My account: see which providers are connected, connect another, or disconnect one.
 * Connecting starts with a POST from this signed-in page (never a plain link), so no other website can make
 * a visitor attach someone else's account to theirs. The API refuses to remove the last way to sign in.
 */
export function ConnectedAccounts({ hasPassword }: { hasPassword: boolean }) {
  const client = useQueryClient();
  const enabled = useProviders();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [confirming, setConfirming] = useState<ProviderId | null>(null);

  // The API sends people back here with a short code in the address after connecting (or failing to).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const problem = failureWording(params.get("oauth_error") ?? undefined);
    if (connected !== null && isProviderId(connected)) {
      setMessage({
        kind: "success",
        text: `${PROVIDER_LABEL[connected]} is now connected to your account.`,
      });
    } else if (problem !== null) {
      setMessage({ kind: "error", text: problem });
    }
    if (connected !== null || params.has("oauth_error")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const linked = useQuery({
    queryKey: KEYS.linked,
    queryFn: async () => {
      const r = await oauthApi.linked();
      if (!r.ok) throw new Error(r.reason);
      return r.data;
    },
  });

  const connect = async (provider: ProviderId) => {
    setBusy(provider);
    setMessage(null);
    const r = await oauthApi.link(provider);
    if (r.ok) {
      window.location.assign(r.data.url);
      return;
    }
    setBusy(null);
    setMessage({ kind: "error", text: "We could not start the connection. Please try again." });
  };

  const disconnect = async (provider: ProviderId) => {
    setBusy(provider);
    const r = await oauthApi.unlink(provider);
    setBusy(null);
    setConfirming(null);
    if (r.ok) {
      setMessage({ kind: "success", text: `${PROVIDER_LABEL[provider]} was disconnected.` });
      await client.invalidateQueries({ queryKey: KEYS.linked });
    } else if (r.reason === "rejected" && r.code === "LAST_SIGN_IN_METHOD") {
      setMessage({
        kind: "error",
        text: "This is your only way to sign in. Add a password first, then you can disconnect it.",
      });
    } else {
      setMessage({ kind: "error", text: "We could not disconnect it. Please try again." });
    }
  };

  const connected = linked.data?.identities ?? [];
  const connectedIds = new Set(connected.map((c) => c.provider));
  const available = enabled.filter((p) => !connectedIds.has(p.id));
  if (connected.length === 0 && available.length === 0 && hasPassword) return null;

  return (
    <section aria-labelledby="signin-methods">
      <h2 id="signin-methods" className="font-bold text-primary">
        Sign-in methods
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasPassword
          ? "You can sign in with your email and password, or with any account connected below."
          : "You signed up with a connected account and have no password yet."}{" "}
        {!hasPassword && (
          <Link to="/forgot-password" className="font-medium text-primary underline">
            Add a password
          </Link>
        )}
      </p>
      {message && (
        <div className="mt-3">
          <Notice kind={message.kind}>{message.text}</Notice>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {connected.map((c) => (
          <li
            key={c.provider}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
          >
            <span className="flex items-center gap-3">
              <ProviderIcon id={c.provider} />
              <span>
                <span className="font-medium">{PROVIDER_LABEL[c.provider]}</span>
                {c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}
              </span>
            </span>
            {confirming === c.provider ? (
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === c.provider}
                  onClick={() => void disconnect(c.provider)}
                >
                  {busy === c.provider ? "Working…" : "Yes, disconnect"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>
                  Keep it
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirming(c.provider)}>
                Disconnect
              </Button>
            )}
          </li>
        ))}
        {available.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3 text-sm"
          >
            <span className="flex items-center gap-3">
              <ProviderIcon id={p.id} />
              <span className="font-medium">{p.label}</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void connect(p.id)}
            >
              {busy === p.id ? "Opening…" : "Connect"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
