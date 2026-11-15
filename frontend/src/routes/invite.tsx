import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Gift, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AuthShell, Field, Notice } from "@/components/auth/AuthShell";
import { authHead, failureText, inputClass } from "@/components/auth/helpers";
import { useSession } from "@/lib/session";
import {
  SHARE_MESSAGE,
  inviteUrl,
  normaliseCode,
  progressPercent,
  referralApi,
  shareLinks,
} from "@/lib/referrals";
import type { ReferralStatus } from "@/lib/referrals";

export const Route = createFileRoute("/invite")({
  head: authHead("Invite friends"),
  component: InvitePage,
});

function InvitePage() {
  const session = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.status === "anonymous") void navigate({ to: "/login", replace: true });
  }, [session.status, navigate]);

  const status = useQuery({
    queryKey: ["referral-status"],
    enabled: session.status === "authenticated",
    queryFn: async (): Promise<ReferralStatus> => {
      const r = await referralApi.me();
      if (!r.ok) throw new Error(r.reason);
      return r.data;
    },
  });

  if (session.status !== "authenticated" || status.isPending) {
    return (
      <AuthShell eyebrow="Invite friends" title="Unlock free courses">
        <p className="text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      </AuthShell>
    );
  }
  if (status.isError) {
    return (
      <AuthShell eyebrow="Invite friends" title="Unlock free courses">
        <Notice kind="error">{failureText(status.error.message)}</Notice>
      </AuthShell>
    );
  }
  return <Panel info={status.data} />;
}

function Panel({ info }: { info: ReferralStatus }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = inviteUrl(origin, info.code);
  const percent = progressPercent(info.joined, info.threshold);
  const remaining = Math.max(0, info.threshold - info.joined);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the link is visible and selectable below */
    }
  };

  if (!info.enabled) {
    return (
      <AuthShell eyebrow="Invite friends" title="Unlock free courses">
        <p className="text-sm text-muted-foreground">
          Invitations are paused at the moment. Open courses stay available, and you can still use
          an unlock code below.
        </p>
        <div className="mt-6">
          <RedeemForm />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Invite friends"
      title="Unlock free courses"
      text="Bring friends to learn with you. When enough of them verify their email, every gated course opens for you."
    >
      <div className="space-y-6">
        <section aria-labelledby="progress-h">
          <h2 id="progress-h" className="flex items-center gap-2 text-sm font-semibold">
            {info.unlocked ? <Gift className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            {info.unlocked ? "Unlocked" : "Your progress"}
          </h2>
          <Progress
            value={percent}
            className="mt-3"
            aria-label={`${info.joined} of ${info.threshold} friends joined`}
          />
          <p className="mt-2 text-sm" role="status">
            {info.unlocked ? (
              <>
                You unlocked free courses with {info.joined} friends.{" "}
                <Link to="/courses" className="font-medium text-primary underline">
                  Start learning
                </Link>
              </>
            ) : (
              <>
                {info.joined} of {info.threshold} friends have joined
                {remaining > 0 ? ` — ${remaining} more to go.` : "."}
                {info.waiting > 0
                  ? ` ${info.waiting} more ${info.waiting === 1 ? "is" : "are"} waiting to verify their email.`
                  : ""}
              </>
            )}
          </p>
        </section>

        <section aria-labelledby="link-h">
          <h2 id="link-h" className="text-sm font-semibold">
            Your invite link
          </h2>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={url}
              aria-label="Your invite link"
              className={`${inputClass} mt-0 font-mono text-xs`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Your code: <span className="font-mono">{info.code}</span>. Friends count once they
            verify a real email address. Using several accounts for yourself does not count.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Share your link">
            {shareLinks(url).map((s) => (
              <li key={s.id}>
                <Button asChild variant="outline" size="sm">
                  <a href={s.href} target="_blank" rel="noopener noreferrer">
                    {s.label}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{SHARE_MESSAGE}</p>
        </section>

        <section aria-labelledby="code-h" className="border-t border-border pt-6">
          <h2 id="code-h" className="text-sm font-semibold">
            Have an unlock code?
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Schools, partners and community ambassadors may give you a code.
          </p>
          <RedeemForm />
        </section>
      </div>
    </AuthShell>
  );
}

function RedeemForm() {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const redeem = useMutation({
    mutationFn: async () => {
      const r = await referralApi.redeem(normaliseCode(code));
      if (r.ok) return;
      if (r.reason === "rejected" && r.code === "INVALID_CODE") throw new Error("invalid_code");
      throw new Error(r.reason);
    },
    onSuccess: () => {
      setCode("");
      void client.invalidateQueries({ queryKey: ["referral-status"] });
      void client.invalidateQueries({ queryKey: ["enrolment"] });
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim().length >= 4) redeem.mutate();
      }}
      className="space-y-3"
    >
      <Field label="Unlock code">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={24}
          className={`${inputClass} font-mono uppercase`}
        />
      </Field>
      {redeem.isSuccess && (
        <Notice kind="success">Code accepted. Your courses are unlocked.</Notice>
      )}
      {redeem.isError && (
        <Notice kind="error">
          {redeem.error.message === "invalid_code"
            ? "That code is not valid, has expired, or has already been used up."
            : failureText(redeem.error.message)}
        </Notice>
      )}
      <Button type="submit" variant="gold" disabled={redeem.isPending || code.trim().length < 4}>
        {redeem.isPending ? "Checking…" : "Redeem code"}
      </Button>
    </form>
  );
}
