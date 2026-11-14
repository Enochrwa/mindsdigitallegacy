import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, PlayCircle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHero } from "@/components/site/Layout";
import { Blocks } from "@/components/academy/Blocks";
import { LEVEL_LABEL, academyApi, formatDuration } from "@/lib/academy";
import { failureText } from "@/components/auth/helpers";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/courses/$slug/")({
  head: () => ({ meta: [{ title: "Course | Minds Digital Legacy" }] }),
  component: CoursePage,
});

function CoursePage() {
  const { slug } = Route.useParams();
  const session = useSession();
  const navigate = useNavigate();
  const client = useQueryClient();

  const course = useQuery({
    queryKey: ["course", slug],
    queryFn: async () => {
      const r = await academyApi.course(slug);
      if (!r.ok) throw new Error(r.reason);
      return r.data.course;
    },
    retry: false,
  });
  const enrolment = useQuery({
    queryKey: ["enrolment", slug],
    enabled: session.status === "authenticated",
    queryFn: async () => {
      const r = await academyApi.enrolment(slug);
      if (!r.ok) throw new Error(r.reason);
      return r.data.enrolment;
    },
  });
  const enrol = useMutation({
    mutationFn: async () => {
      const r = await academyApi.enrol(slug);
      if (!r.ok) throw new Error(r.reason);
      return r.data.enrolment;
    },
    onSuccess: async (e) => {
      client.setQueryData(["enrolment", slug], e);
      await client.invalidateQueries({ queryKey: ["learning"] });
    },
  });

  if (course.isPending)
    return (
      <p role="status" className="container-mdl py-16 text-muted-foreground">
        Loading course…
      </p>
    );
  if (course.isError || !course.data)
    return (
      <div className="container-mdl py-16">
        <h1 className="text-2xl font-bold text-primary">Course not found</h1>
        <p className="mt-2 text-muted-foreground">
          It may have been renamed or is not published yet.
        </p>
        <Button asChild className="mt-6">
          <Link to="/courses">Browse courses</Link>
        </Button>
      </div>
    );

  const c = course.data;
  const mine = enrolment.data ?? enrol.data ?? null;
  const first = c.sections[0]?.lessons[0];
  const target = mine?.continueLesson?.slug ?? first?.slug;
  const locked = mine?.access.state === "locked";

  return (
    <>
      <PageHero eyebrow={c.category.name} title={c.title} text={c.summary} />
      <div className="container-mdl grid gap-10 py-12 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-10">
          <section aria-labelledby="about">
            <h2 id="about" className="mb-3 text-2xl font-bold text-primary">
              About this course
            </h2>
            <Blocks blocks={c.description} />
          </section>
          <section aria-labelledby="learn">
            <h2 id="learn" className="mb-3 text-2xl font-bold text-primary">
              What you will learn
            </h2>
            <ul className="space-y-2">
              {c.outcomes.map((o) => (
                <li key={o} className="flex gap-2">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {o}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="outline">
            <h2 id="outline" className="mb-3 text-2xl font-bold text-primary">
              Lessons
            </h2>
            {c.sections.map((s) => (
              <div key={s.title} className="mb-6">
                <h3 className="font-semibold">{s.title}</h3>
                <ol className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {s.lessons.map((l) => (
                    <li key={l.slug} className="flex items-center gap-3 p-3 text-sm">
                      {l.kind === "video" ? (
                        <PlayCircle className="h-4 w-4 text-accent" aria-hidden />
                      ) : (
                        <BookOpen className="h-4 w-4 text-accent" aria-hidden />
                      )}
                      <span className="flex-1">
                        {l.isPreview || mine?.access.state === "unlocked" ? (
                          <Link
                            to="/courses/$slug/learn/$lessonSlug"
                            params={{ slug, lessonSlug: l.slug }}
                            className="font-medium hover:underline"
                          >
                            {l.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{l.title}</span>
                        )}
                        <span className="block text-muted-foreground">{l.summary}</span>
                      </span>
                      {l.isPreview ? (
                        <span className="flex items-center gap-1 text-xs text-primary">
                          <Eye className="h-3.5 w-3.5" aria-hidden />
                          Free preview
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        </div>
        <aside
          className="h-fit rounded-xl border border-border bg-card p-6 shadow-card lg:sticky lg:top-24"
          aria-label="Enrolment"
        >
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Level</dt>
              <dd>{LEVEL_LABEL[c.level]}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Lessons</dt>
              <dd>{c.stats.lessonCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Time</dt>
              <dd>{formatDuration(c.stats.totalDurationSec)}</dd>
            </div>
          </dl>
          {c.prerequisites.length > 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Helpful first:{" "}
              {c.prerequisites.map((p) => (
                <Link
                  key={p.slug}
                  to="/courses/$slug"
                  params={{ slug: p.slug }}
                  className="underline"
                >
                  {p.title}
                </Link>
              ))}
            </p>
          ) : null}
          <div className="mt-6 space-y-3">
            {mine ? (
              <>
                <Progress value={mine.progress.percent} aria-label="Your progress" />
                <p className="text-sm text-muted-foreground">
                  {mine.status === "completed"
                    ? "You completed this course."
                    : `${mine.progress.percent}% complete`}
                </p>
                {locked ? (
                  <p role="status" className="text-sm">
                    This course unlocks when you complete the sharing step. We are finishing that
                    feature.
                  </p>
                ) : target ? (
                  <Button asChild variant="gold" className="w-full">
                    <Link
                      to="/courses/$slug/learn/$lessonSlug"
                      params={{ slug, lessonSlug: target }}
                    >
                      {mine.progress.percent > 0 ? "Continue" : "Start learning"}
                    </Link>
                  </Button>
                ) : null}
              </>
            ) : session.status === "authenticated" ? (
              <Button
                variant="gold"
                className="w-full"
                disabled={enrol.isPending}
                onClick={() => enrol.mutate()}
              >
                {enrol.isPending ? "Enrolling…" : "Enrol for free"}
              </Button>
            ) : (
              <Button
                variant="gold"
                className="w-full"
                disabled={session.status === "loading"}
                onClick={() => void navigate({ to: "/login" })}
              >
                Sign in to enrol
              </Button>
            )}
            {enrol.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {failureText(enrol.error.message)}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
