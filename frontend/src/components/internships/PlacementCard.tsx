import { PLACEMENT_STATUS_LABEL, averageRating, dateText } from "@/lib/internships";
import type { ApplicantPlacement } from "@/lib/internships";

export function PlacementCard({ placement: p }: { placement: ApplicantPlacement }) {
  const average = averageRating(p.feedback.map((f) => f.rating));
  return (
    <article className="rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-primary">{p.posting?.title ?? "Internship"}</h3>
          <p className="text-sm text-muted-foreground">
            {dateText(p.startsOn)} to {dateText(p.endsOn)}
          </p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          {PLACEMENT_STATUS_LABEL[p.status] ?? p.status}
        </span>
      </div>
      {p.supervisor && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">Your supervisor: </span>
          {p.supervisor.name}
        </p>
      )}
      {p.outcomeSummary && (
        <p className="mt-3 rounded-md border border-border bg-muted p-3 text-sm">
          {p.outcomeSummary}
        </p>
      )}
      {p.feedback.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-primary">
            Feedback from your supervisor
            {average !== null && (
              <span className="ml-2 font-normal text-muted-foreground">
                (average {average} / 5)
              </span>
            )}
          </h4>
          <ul className="mt-2 space-y-3">
            {p.feedback.map((f, i) => (
              <li key={`${f.at}-${String(i)}`} className="border-l-2 border-accent pl-3 text-sm">
                <p>{f.text}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {dateText(f.at)}
                  {f.rating !== undefined && ` · ${String(f.rating)} / 5`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
