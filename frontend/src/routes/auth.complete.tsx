import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AuthShell, Field, Notice } from "@/components/auth/AuthShell";
import { ProviderIcon } from "@/components/auth/SocialButtons";
import { authHead, inputClass } from "@/components/auth/helpers";
import { PRIVACY_NOTICE_VERSION } from "@/lib/api";
import { KEYS, completeFailureWording, oauthApi } from "@/lib/oauth";
import { looksLikeCode, normaliseCode, recalledCode, forgetCode } from "@/lib/referrals";
import { useRefreshSession } from "@/lib/session";

export const Route = createFileRoute("/auth/complete")({
  head: authHead("Finish signing up"),
  component: CompletePage,
});

/**
 * The last step for someone who came from Google, GitHub, etc. and has no MDL account yet. Nothing has been
 * created at this point: the provider only told us who they are. They choose their age group and agree to the
 * privacy notice, exactly as on the email sign-up form. For providers that do not vouch for the email (Microsoft,
 * Facebook) we also email a code to prove they own the mailbox.
 */
function CompletePage() {
  const navigate = useNavigate();
  const refresh = useRefreshSession();
  const pending = useQuery({
    queryKey: KEYS.pending,
    enabled: typeof window !== "undefined",
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const r = await oauthApi.pending();
      if (!r.ok) throw new Error(r.reason);
      return r.data.pending;
    },
  });

  const [age, setAge] = useState<"" | "under_16" | "16_plus">("");
  const [guardian, setGuardian] = useState("");
  const [referral, setReferral] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"form" | "code" | "guardian">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReferral(recalledCode());
  }, []);
  useEffect(() => {
    if (pending.data?.codeSent === true) setStage("code");
  }, [pending.data?.codeSent]);

  const signedIn = async () => {
    forgetCode();
    await refresh();
    await navigate({ to: "/account", replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (age === "") return setError("Select your age group.");
    if (age === "under_16" && guardian.trim() === "") {
      return setError("A parent or guardian email is required for learners under 16.");
    }
    if (!consent) return setError("Please accept the privacy notice to continue.");
    setBusy(true);
    const r = await oauthApi.complete({
      ageBracket: age,
      ...(age === "under_16" ? { guardianEmail: guardian.trim().toLowerCase() } : {}),
      consent: true,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      ...(looksLikeCode(referral) ? { referralCode: normaliseCode(referral) } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      return setError(
        r.reason === "validation" && r.problems[0]
          ? r.problems[0].message
          : completeFailureWording(r.reason === "rejected" ? r.code : undefined, r.reason),
      );
    }
    if (r.data.status === "signed_in") return void signedIn();
    if (r.data.status === "guardian_pending") return setStage("guardian");
    setStage("code");
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await oauthApi.confirmCode(code);
    setBusy(false);
    if (!r.ok) {
      return setError(
        completeFailureWording(r.reason === "rejected" ? r.code : undefined, r.reason),
      );
    }
    if (r.data.status === "signed_in") return void signedIn();
    setStage("guardian");
  };

  if (pending.isPending) {
    return (
      <AuthShell eyebrow="Account" title="Finish signing up">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </AuthShell>
    );
  }

  if (pending.data == null) {
    return (
      <AuthShell eyebrow="Account" title="Sign-up expired">
        <p className="text-sm text-muted-foreground">
          This sign-up took too long, or it was opened in a different browser. Please start again.
        </p>
        <Button asChild variant="gold" className="mt-4">
          <Link to="/register">Start again</Link>
        </Button>
      </AuthShell>
    );
  }

  const info = pending.data;

  if (stage === "guardian") {
    return (
      <AuthShell eyebrow="Account" title="Check with your parent or guardian">
        <p className="text-sm text-muted-foreground">
          Your profile is ready. We emailed your parent or guardian to confirm. Your account starts
          working as soon as they do.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Join MDL"
      title="Finish signing up"
      text={`Almost there. Just two quick things before your account is created.`}
    >
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
        <ProviderIcon id={info.provider} className="h-6 w-6" />
        <span>
          <span className="block font-medium">{info.name}</span>
          <span className="block text-xs text-muted-foreground">
            {info.email} via {info.label}
          </span>
        </span>
      </div>

      {stage === "code" ? (
        <form onSubmit={(e) => void confirm(e)} noValidate className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {info.label} does not confirm email addresses to us, so we sent an 8-digit code to{" "}
            <strong>{info.email}</strong>. Enter it here. It works for 15 minutes, in this browser.
          </p>
          <Field label="Confirmation code">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} font-mono tracking-widest`}
            />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            disabled={busy || code.trim().length < 6}
          >
            {busy ? "Checking…" : "Create my account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No email? Check spam, or{" "}
            <button
              type="button"
              className="font-medium text-primary underline"
              onClick={() => setStage("form")}
            >
              go back and send a new code
            </button>
            .
          </p>
        </form>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <Field label="Age group">
            <select
              value={age}
              onChange={(e) => setAge(e.target.value as typeof age)}
              className={inputClass}
            >
              <option value="">Select…</option>
              <option value="16_plus">16 or older</option>
              <option value="under_16">Under 16</option>
            </select>
          </Field>
          {age === "under_16" && (
            <Field label="Parent or guardian email">
              <input
                type="email"
                value={guardian}
                onChange={(e) => setGuardian(e.target.value)}
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                We email them to confirm. Your account cannot be used until they do.
              </span>
            </Field>
          )}
          <Field label="Invite code (optional)">
            <input
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={20}
              value={referral}
              onChange={(e) => setReferral(e.target.value)}
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              I agree that MDL may store and use my details to run my account, as described in the{" "}
              <Link to="/privacy" className="font-medium text-primary underline">
                privacy notice
              </Link>
              .
            </span>
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy}>
            {busy ? "Working…" : info.needsCode ? "Send me a code" : "Create my account"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
