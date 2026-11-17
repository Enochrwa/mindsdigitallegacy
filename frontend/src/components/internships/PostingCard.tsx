import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Users } from "lucide-react";
import {
  COMPENSATION_LABEL,
  DEPARTMENT_LABEL,
  MODE_LABEL,
  deadlineText,
  workload,
} from "@/lib/internships";
import type { PublicPosting } from "@/lib/internships";

export function PostingCard({ posting: p }: { posting: PublicPosting }) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-card">
      <p className="eyebrow">{DEPARTMENT_LABEL[p.department]}</p>
      <h3 className="mt-2 text-xl font-bold text-primary">
        <Link
          to="/internships/$slug"
          params={{ slug: p.slug }}
          className="hover:underline focus-visible:underline"
        >
          {p.title}
        </Link>
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{p.summary}</p>
      <ul className="mt-4 space-y-1.5 text-sm">
        <li className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-accent" aria-hidden />
          {MODE_LABEL[p.mode]} · {p.location}
        </li>
        <li className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" aria-hidden />
          {workload(p)}
        </li>
        <li className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" aria-hidden />
          {String(p.slots)} {p.slots === 1 ? "place" : "places"} ·{" "}
          {COMPENSATION_LABEL[p.compensation]}
        </li>
      </ul>
      <p className="mt-4 text-xs font-medium text-muted-foreground">{deadlineText(p.closesAt)}</p>
    </article>
  );
}
