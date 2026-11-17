import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/site/Layout";
import { authHead } from "@/components/auth/helpers";
import { KEYS, PLACEMENT_STATUS_LABEL, dateText, internshipsApi } from "@/lib/internships";
import type { SupervisorPlacement } from "@/lib/internships";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/supervisor")({
  head: authHead("Supervisor view"),
  component: SupervisorPage,
});

const fieldCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/30";

function FeedbackForm({ placement }: { placement: SupervisorPlacement }) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [rating, setRating] = useState("");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 5) {
      toast.error("Write at least a short sentence.");
      return;
    }
    setBusy(true);
    const r = await internshipsApi.addFeedback(placement.id, {
      text: text.trim(),
      ...(rating === "" ? {} : { rating: Number(rating) }),
      visibleToIntern: visible,
    });
    setBusy(false);
    if (r.ok) {
      toast.success("Feedback saved.");
      setText("");
      setRating("");
      await client.invalidateQueries({ queryKey: KEYS.supervisor });
    } else {
      toast.error("We could not save your feedback. This placement may have ended.");
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3 border-t border-border pt-4">
      <label className="block text-sm font-medium">
        Add feedback
        <textarea
          className={`${fieldCls} min-h-20`}
          value={text}
          maxLength={1500}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-sm font-medium">
          Rating (optional)
          <select className={fieldCls} value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">No rating</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Share with the intern
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save feedback"}
        </Button>
      </div>
    </form>
  );
}

function SupervisorPage() {
  const session = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.status === "anonymous") void navigate({ to: "/login", replace: true });
  }, [session.status, navigate]);

  const isSupervisor =
    session.status === "authenticated" && session.user.roles.includes("supervisor");
  const query = useQuery({
    queryKey: KEYS.supervisor,
    enabled: isSupervisor,
    queryFn: async () => {
      const r = await internshipsApi.supervisorPlacements();
      if (!r.ok) throw new Error(r.reason);
      return r.data.items;
    },
  });

  return (
    <>
      <PageHero
        eyebrow="Internships"
        title="Supervisor view"
        text="The interns you guide, and the feedback you give them."
      />
      <div className="container-mdl py-12">
        {session.status === "authenticated" && !isSupervisor && (
          <div className="rounded-xl border border-border bg-muted p-6">
            <p className="font-semibold text-primary">This page is for MDL supervisors.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/account">Back to my account</Link>
            </Button>
          </div>
        )}
        {isSupervisor && query.isPending && (
          <p role="status" className="text-muted-foreground">
            Loading…
          </p>
        )}
        {query.isError && (
          <p role="alert" className="text-sm text-destructive">
            We could not load your placements. Please reload the page.
          </p>
        )}
        {query.data && query.data.length === 0 && (
          <p className="text-muted-foreground">You are not guiding any interns yet.</p>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {query.data?.map((p) => (
            <article key={p.id} className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-primary">
                    {p.intern?.displayName ?? "Intern"}
                  </h2>
                  <p className="text-sm text-muted-foreground">{p.postingTitle}</p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                  {PLACEMENT_STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
              <p className="mt-2 text-sm">
                {dateText(p.startsOn)} to {dateText(p.endsOn)}
              </p>
              {p.intern && (
                <p className="text-sm text-muted-foreground">
                  Contact:{" "}
                  <a className="underline" href={`mailto:${p.intern.email}`}>
                    {p.intern.email}
                  </a>
                </p>
              )}
              {p.feedback.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {p.feedback.map((f, i) => (
                    <li
                      key={`${f.at}-${String(i)}`}
                      className="border-l-2 border-accent pl-3 text-sm"
                    >
                      <p>{f.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {dateText(f.at)}
                        {f.rating !== undefined && ` · ${String(f.rating)} / 5`}
                        {!f.visibleToIntern && " · private"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {p.status === "active" && <FeedbackForm placement={p} />}
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
