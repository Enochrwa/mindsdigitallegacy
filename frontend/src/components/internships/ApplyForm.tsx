import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRIVACY_NOTICE_VERSION } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  KEYS,
  STATEMENT_MAX,
  applyFailureText,
  internshipsApi,
  linkProblem,
  parseLinks,
  statementProblem,
} from "@/lib/internships";
import type { PublicPosting } from "@/lib/internships";

const fieldCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/30";

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-6 shadow-card">{children}</div>;
}

/** The application form. Anyone can read a posting, but applying needs a verified, signed-in account. */
export function ApplyForm({ posting }: { posting: PublicPosting }) {
  const session = useSession();
  const client = useQueryClient();
  const [statement, setStatement] = useState("");
  const [linksText, setLinksText] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [under18, setUnder18] = useState(false);
  const [guardian, setGuardian] = useState({ name: "", relationship: "", contact: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (session.status === "loading") {
    return (
      <Panel>
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </Panel>
    );
  }

  if (session.status === "anonymous") {
    return (
      <Panel>
        <h2 className="text-xl font-bold text-primary">Sign in to apply</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You need an MDL account with a verified email address. It is free, and it lets you follow
          your application.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="gold">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">Create an account</Link>
          </Button>
        </div>
      </Panel>
    );
  }

  const user = session.user;
  if (!user.emailVerified) {
    return (
      <Panel>
        <h2 className="text-xl font-bold text-primary">Verify your email first</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Open the email we sent you and follow the link, then come back to apply.
        </p>
      </Panel>
    );
  }
  if (user.ageBracket === "under_16") {
    return (
      <Panel>
        <h2 className="text-xl font-bold text-primary">Internships start at 16</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Our internships are for people aged 16 and over. You are welcome to keep learning in the
          free MDL Digital Academy.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/courses">Browse courses</Link>
        </Button>
      </Panel>
    );
  }

  if (done) {
    return (
      <Panel>
        <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
        <h2 className="mt-3 text-xl font-bold text-primary">Application received</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you. We sent a confirmation to your email. Receiving it does not guarantee a place:
          we can only accept interns when we have a suitable project and a supervisor. You can
          follow the status of your application at any time.
        </p>
        <Button asChild variant="gold" className="mt-4">
          <Link to="/account/internships">See my applications</Link>
        </Button>
      </Panel>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const links = parseLinks(linksText);
    const problem =
      statementProblem(statement) ??
      linkProblem(links) ??
      (under18 &&
      (guardian.name.trim().length < 2 ||
        guardian.relationship.trim().length < 2 ||
        guardian.contact.trim().length < 5)
        ? "Please fill in your parent or guardian's name, relationship and contact."
        : null) ??
      (consent ? null : "Please accept the privacy notice to apply.");
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    const result = await internshipsApi.apply(posting.slug, {
      statement: statement.trim(),
      links,
      ...(availableFrom === "" ? {} : { availableFrom }),
      under18,
      ...(under18
        ? {
            guardian: {
              name: guardian.name.trim(),
              relationship: guardian.relationship.trim(),
              contact: guardian.contact.trim(),
            },
          }
        : {}),
      consent: true,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    });
    setBusy(false);
    if (result.ok) {
      await client.invalidateQueries({ queryKey: KEYS.mine });
      setDone(true);
      return;
    }
    setError(
      applyFailureText(result.reason === "rejected" ? result.code : undefined, result.reason),
    );
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <h2 className="text-xl font-bold text-primary">Apply for this internship</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Applying as {user.displayName}. Fields marked * are required.
      </p>

      <div className="mt-5 space-y-5">
        <label className="block text-sm font-medium">
          Why do you want this internship, and what can you already do? *
          <textarea
            className={`${fieldCls} min-h-40`}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            maxLength={STATEMENT_MAX}
            aria-describedby="statement-count"
            required
          />
          <span
            id="statement-count"
            className="mt-1 block text-xs font-normal text-muted-foreground"
          >
            {statement.trim().length} / {STATEMENT_MAX} characters (at least 50)
          </span>
        </label>

        <label className="block text-sm font-medium">
          Links to your work (optional, one per line)
          <textarea
            className={`${fieldCls} min-h-24 font-mono`}
            value={linksText}
            onChange={(e) => setLinksText(e.target.value)}
            placeholder="https://github.com/your-name"
            aria-describedby="links-help"
          />
          <span id="links-help" className="mt-1 block text-xs font-normal text-muted-foreground">
            Up to 5 links. They must start with https://
          </span>
        </label>

        <label className="block text-sm font-medium">
          When could you start? (optional)
          <input
            type="date"
            className={fieldCls}
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
          />
        </label>

        {posting.minAge === 16 && (
          <div className="rounded-md border border-border p-4">
            <label className="flex items-start gap-3 text-sm font-medium">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={under18}
                onChange={(e) => setUnder18(e.target.checked)}
              />
              <span>
                I am under 18
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  We will ask your parent or guardian to confirm before any placement starts.
                </span>
              </span>
            </label>
            {under18 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium">
                  Parent or guardian name *
                  <input
                    className={fieldCls}
                    value={guardian.name}
                    maxLength={100}
                    onChange={(e) => setGuardian({ ...guardian, name: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Relationship *
                  <input
                    className={fieldCls}
                    value={guardian.relationship}
                    maxLength={50}
                    onChange={(e) => setGuardian({ ...guardian, relationship: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Phone or email *
                  <input
                    className={fieldCls}
                    value={guardian.contact}
                    maxLength={150}
                    onChange={(e) => setGuardian({ ...guardian, contact: e.target.value })}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I agree that MDL may store and use my application to consider me for this internship, as
            described in the{" "}
            <Link to="/privacy" className="font-medium text-primary underline">
              privacy notice
            </Link>
            .
          </span>
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" variant="gold" size="lg" className="mt-6" disabled={busy}>
        {busy ? "Sending…" : "Submit application"}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">{posting.notice}</p>
    </form>
  );
}
