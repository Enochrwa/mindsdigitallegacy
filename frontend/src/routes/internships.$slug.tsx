import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHero } from "@/components/site/Layout";
import { ApplyForm } from "@/components/internships/ApplyForm";
import {
  COMPENSATION_LABEL,
  DEPARTMENT_LABEL,
  MODE_LABEL,
  deadlineText,
  usePosting,
  workload,
} from "@/lib/internships";

export const Route = createFileRoute("/internships/$slug")({
  head: () => ({
    meta: [
      { title: "Internship | Minds Digital Legacy" },
      {
        name: "description",
        content: "Details of a supervised internship at Minds Digital Legacy.",
      },
    ],
  }),
  component: PostingPage,
});

function PostingPage() {
  const { slug } = Route.useParams();
  const query = usePosting(slug);

  if (query.isPending) {
    return (
      <div className="container-mdl py-20">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </div>
    );
  }
  if (query.isError || query.data === undefined) {
    return (
      <div className="container-mdl py-20 text-center">
        <h1 className="text-2xl font-bold text-primary">This internship is not available</h1>
        <p className="mt-2 text-muted-foreground">
          It may have closed or the link may be wrong. See what is open now.
        </p>
        <Link to="/internships" className="mt-4 inline-block font-medium text-primary underline">
          All internships
        </Link>
      </div>
    );
  }

  const p = query.data;
  return (
    <>
      <PageHero eyebrow={DEPARTMENT_LABEL[p.department]} title={p.title} text={p.summary} />
      <div className="container-mdl grid gap-10 py-12 lg:grid-cols-[1fr_28rem]">
        <article>
          <Link
            to="/internships"
            className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> All internships
          </Link>

          <dl className="grid gap-4 rounded-xl border border-border bg-muted p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-primary">Where</dt>
              <dd>
                {MODE_LABEL[p.mode]} · {p.location}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-primary">Time</dt>
              <dd>{workload(p)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-primary">Pay</dt>
              <dd>
                {COMPENSATION_LABEL[p.compensation]}
                {p.compensationNote !== "" && <span className="block">{p.compensationNote}</span>}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-primary">Places and deadline</dt>
              <dd>
                {String(p.slots)} {p.slots === 1 ? "place" : "places"} · {deadlineText(p.closesAt)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-primary">Minimum age</dt>
              <dd>{String(p.minAge)}</dd>
            </div>
          </dl>

          <h2 className="mt-8 text-xl font-bold text-primary">About the role</h2>
          <p className="mt-2 whitespace-pre-line text-muted-foreground">{p.description}</p>

          <h2 className="mt-8 text-xl font-bold text-primary">What we are looking for</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {p.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

          <h2 className="mt-8 text-xl font-bold text-primary">What you will learn</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {p.learningGoals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>

          <p className="mt-8 rounded-md border border-border bg-muted p-4 text-sm">{p.notice}</p>
        </article>
        <aside>
          <ApplyForm posting={p} />
        </aside>
      </div>
    </>
  );
}
