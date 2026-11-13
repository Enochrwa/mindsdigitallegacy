import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AuthShell, Field, Notice } from "@/components/auth/AuthShell";
import { authHead, failureText, inputClass } from "@/components/auth/helpers";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/api";
import { useClearSession, useRefreshSession, useSession } from "@/lib/session";

export const Route = createFileRoute("/account")({
  head: authHead("My account"),
  component: AccountPage,
});

function AccountPage() {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session.status === "anonymous") void navigate({ to: "/login", replace: true });
  }, [session.status, navigate]);

  if (session.status !== "authenticated") {
    return (
      <AuthShell eyebrow="Account" title="My account">
        <p className="text-sm text-muted-foreground" role="status">
          Loading your account…
        </p>
      </AuthShell>
    );
  }
  return <Signed user={session.user} />;
}

function Signed({ user }: { user: Profile }) {
  const navigate = useNavigate();
  const clear = useClearSession();
  const refresh = useRefreshSession();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const marketing = user.consents.some((c) => c.type === "marketing" && c.withdrawnAt === null);

  const signOut = async () => {
    await api.auth.logout();
    clear();
    await navigate({ to: "/" });
  };

  const toggleMarketing = async (granted: boolean) => {
    setMessage(null);
    const result = await api.users.setMarketingConsent(granted);
    if (result.ok) {
      await refresh();
      setMessage({
        kind: "success",
        text: granted
          ? "You will receive updates from us."
          : "You will not receive marketing messages.",
      });
    } else {
      setMessage({ kind: "error", text: failureText(result.reason) });
    }
  };

  const exportData = async () => {
    setMessage(null);
    const result = await api.users.exportData();
    if (!result.ok) {
      setMessage({ kind: "error", text: failureText(result.reason) });
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "mdl-my-data.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteAccount = async () => {
    setBusy(true);
    setMessage(null);
    const result = await api.users.deleteAccount(password);
    setBusy(false);
    if (result.ok) {
      clear();
      await navigate({ to: "/" });
    } else if (result.reason === "invalid_credentials") {
      setMessage({ kind: "error", text: "That password is not correct." });
    } else {
      setMessage({ kind: "error", text: failureText(result.reason) });
    }
  };

  return (
    <AuthShell eyebrow="Account" title="My account">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium">{user.displayName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
      </dl>

      <hr className="my-6 border-border" />
      <h2 className="font-bold text-primary">Messages from us</h2>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(e) => void toggleMarketing(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          Send me news about courses, internships and events. You can change this at any time.
        </span>
      </label>

      <hr className="my-6 border-border" />
      <h2 className="font-bold text-primary">Your data</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Download a copy of the personal data we hold about your account.
      </p>
      <Button variant="outline" className="mt-3" onClick={exportData}>
        Download my data
      </Button>

      {message && (
        <div className="mt-6">
          <Notice kind={message.kind}>{message.text}</Notice>
        </div>
      )}

      <hr className="my-6 border-border" />
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
        {!confirmingDelete && (
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete my account
          </Button>
        )}
      </div>

      {confirmingDelete && (
        <div className="mt-6 space-y-3 rounded-md border border-destructive/30 p-4">
          <p className="text-sm">
            This deactivates your account now and removes your data after a grace period. Enter your
            password to confirm.
          </p>
          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={deleteAccount}
              disabled={busy || password.length === 0}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmingDelete(false);
                setPassword("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
