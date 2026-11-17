import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AGREEMENT_DRAFT,
  APPLICANT_STATUS_TEXT,
  KEYS,
  dateText,
  internshipsApi,
} from "@/lib/internships";
import type { ApplicantApplication } from "@/lib/internships";

const TONE: Record<string, string> = {
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
  offered: "bg-accent/20 text-primary",
  placed: "bg-success/15 text-success",
};

export function ApplicationCard({ application: a }: { application: ApplicantApplication }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const text = APPLICANT_STATUS_TEXT[a.status];

  const refresh = () => client.invalidateQueries({ queryKey: KEYS.mine });

  const withdraw = async () => {
    setBusy(true);
    const r = await internshipsApi.withdraw(a.id);
    setBusy(false);
    setConfirmWithdraw(false);
    if (r.ok) {
      toast.success("Application withdrawn.");
      await refresh();
    } else {
      toast.error("We could not withdraw this application. Reload and try again.");
      await refresh();
    }
  };

  const accept = async () => {
    setBusy(true);
    const r = await internshipsApi.accept(a.id, a.agreementVersion);
    setBusy(false);
    if (r.ok) {
      setAccepting(false);
      toast.success("Offer accepted. We will confirm your supervisor and dates.");
      await refresh();
    } else {
      toast.error(
        r.reason === "rejected" && r.code === "AGREEMENT_CHANGED"
          ? "The agreement was updated. Reload the page to read the current version."
          : "We could not record your acceptance. Reload and try again.",
      );
    }
  };

  return (
    <article className="rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-primary">
            {a.posting ? (
              <Link
                to="/internships/$slug"
                params={{ slug: a.posting.slug }}
                className="hover:underline"
              >
                {a.posting.title}
              </Link>
            ) : (
              "Internship"
            )}
          </h3>
          <p className="text-xs text-muted-foreground">Applied {dateText(a.createdAt)}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[a.status] ?? "bg-secondary text-secondary-foreground"}`}
        >
          {text.label}
        </span>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{text.help}</p>
      {a.messageToApplicant && (
        <p className="mt-3 rounded-md border border-border bg-muted p-3 text-sm">
          <span className="font-semibold">Message from our team: </span>
          {a.messageToApplicant}
        </p>
      )}
      {a.under18 &&
        a.guardian &&
        !a.guardian.verified &&
        a.status !== "rejected" &&
        a.status !== "withdrawn" && (
          <p className="mt-3 text-sm text-muted-foreground">
            We will contact {a.guardian.name} ({a.guardian.relationship}) to confirm before any
            placement starts.
          </p>
        )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-primary">Progress</summary>
        <ol className="mt-2 space-y-1 border-l-2 border-border pl-4">
          {a.timeline.map((t, i) => (
            <li key={`${t.status}-${String(i)}`}>
              <span className="font-medium">{APPLICANT_STATUS_TEXT[t.status].label}</span>{" "}
              <span className="text-muted-foreground">{dateText(t.at)}</span>
            </li>
          ))}
        </ol>
      </details>

      {(a.canAccept || a.canWithdraw) && (
        <div className="mt-5 flex flex-wrap gap-3">
          {a.canAccept && (
            <Button variant="gold" onClick={() => setAccepting(true)} disabled={busy}>
              Read agreement and accept
            </Button>
          )}
          {a.canWithdraw && (
            <Button variant="outline" onClick={() => setConfirmWithdraw(true)} disabled={busy}>
              {a.status === "offered" ? "Decline offer" : "Withdraw application"}
            </Button>
          )}
        </div>
      )}

      <Dialog open={accepting} onOpenChange={(o) => !busy && setAccepting(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Intern agreement</DialogTitle>
            <DialogDescription>
              Please read this before you accept. Draft version {AGREEMENT_DRAFT.version}.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {AGREEMENT_DRAFT.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
            This is a plain-language summary. The full agreement is shared with you and signed
            before your placement begins.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>I have read the agreement and I accept this offer.</span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccepting(false)} disabled={busy}>
              Not now
            </Button>
            <Button variant="gold" onClick={() => void accept()} disabled={busy || !agreed}>
              {busy ? "Saving…" : "Accept offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmWithdraw} onOpenChange={(o) => !busy && setConfirmWithdraw(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {a.status === "offered" ? "Decline this offer?" : "Withdraw your application?"}
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. You can apply again later if the internship is still open.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmWithdraw(false)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => void withdraw()} disabled={busy}>
              {busy ? "Working…" : "Yes, withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
