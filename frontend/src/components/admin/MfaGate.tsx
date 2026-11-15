import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { META_KEY, adminApi, failureMessage } from "@/lib/admin";
import { Field, Notice, inputCls } from "./ui";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container-mdl py-12">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <ShieldCheck className="h-5 w-5 text-accent" aria-hidden /> {title}
        </h1>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

const group = (secret: string): string => secret.replace(/(.{4})/g, "$1 ").trim();

/** First-time setup: show the key, confirm one code, then reveal the recovery codes (once). */
export function MfaSetup({ onRecoveryCodes }: { onRecoveryCodes: (codes: string[]) => void }) {
  const client = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    const result = await adminApi.post<{ secret: string; otpauthUri: string }>("/mfa/setup");
    setBusy(false);
    if (result.ok) setSetup(result.data);
    else setError(failureMessage(result));
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await adminApi.post<{ recoveryCodes: string[] }>("/mfa/enable", {
      code: code.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === "rejected" && result.code === "INVALID_CODE"
          ? "That code is not right. Check the time on your phone and try again."
          : failureMessage(result),
      );
      return;
    }
    onRecoveryCodes(result.data.recoveryCodes);
    await client.invalidateQueries({ queryKey: META_KEY });
  };

  return (
    <Shell title="Set up two-step verification">
      <p className="text-sm text-muted-foreground">
        The admin console needs a second step at every sign-in. Use any authenticator app (Google
        Authenticator, Microsoft Authenticator, Authy, 1Password).
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      {setup === null ? (
        <Button onClick={start} disabled={busy}>
          <KeyRound aria-hidden /> Start setup
        </Button>
      ) : (
        <form onSubmit={confirm} className="space-y-4">
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              In your authenticator app choose <strong>Add account</strong>, then{" "}
              <strong>Enter a setup key</strong>.
              <div className="mt-2 rounded-md border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">Setup key (time-based)</p>
                <p
                  className="mt-1 break-all font-mono text-base tracking-wider"
                  data-testid="totp-secret"
                >
                  {group(setup.secret)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    void navigator.clipboard?.writeText(setup.secret);
                    toast.success("Setup key copied");
                  }}
                >
                  <Copy aria-hidden /> Copy key
                </Button>
              </div>
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Authenticator asks for a link instead?</summary>
                <p className="mt-1 break-all font-mono">{setup.otpauthUri}</p>
              </details>
            </li>
            <li>Enter the 6-digit code your app shows to confirm.</li>
          </ol>
          <Field label="6-digit code">
            <input
              className={inputCls}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
            />
          </Field>
          <Button type="submit" disabled={busy || code.length !== 6}>
            Turn on two-step verification
          </Button>
        </form>
      )}
    </Shell>
  );
}

/** Shown once, straight after enabling. The person must confirm they have saved the codes. */
export function RecoveryCodesScreen({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `MDL admin recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mdl-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Shell title="Save your recovery codes">
      <Notice kind="info">
        If you lose your phone, each of these codes lets you in once. We show them only now. Store
        them somewhere safe, such as a password manager.
      </Notice>
      <ul
        className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted p-3 font-mono text-sm"
        aria-label="Recovery codes"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n"));
            toast.success("Recovery codes copied");
          }}
        >
          <Copy aria-hidden /> Copy
        </Button>
        <Button variant="outline" onClick={download}>
          <Download aria-hidden /> Download
        </Button>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I have saved these codes somewhere safe.
      </label>
      <Button disabled={!saved} onClick={onDone}>
        Continue to the console
      </Button>
    </Shell>
  );
}

/** Second step at sign-in: an authenticator code or one recovery code. */
export function MfaVerify() {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await adminApi.post("/mfa/verify", { code: code.trim() });
    setBusy(false);
    if (result.ok) {
      setCode("");
      await client.invalidateQueries({ queryKey: META_KEY });
      return;
    }
    setError(
      result.reason === "rejected" && result.code === "INVALID_CODE"
        ? "That code is not right. Five wrong attempts lock the account for 15 minutes."
        : failureMessage(result),
    );
  };

  return (
    <Shell title="Confirm it is you">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </p>
        <div aria-live="assertive">{error && <Notice kind="error">{error}</Notice>}</div>
        <Field label="Code">
          <input
            className={inputCls}
            autoComplete="one-time-code"
            maxLength={14}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Button type="submit" disabled={busy || code.trim().length < 6}>
          Verify
        </Button>
      </form>
    </Shell>
  );
}
