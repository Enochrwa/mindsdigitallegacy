import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Blocks } from "@/components/academy/Blocks";
import { YouTubeFacade } from "@/components/academy/YouTubeFacade";
import { academyApi } from "@/lib/academy";
import { failureText } from "@/components/auth/helpers";

export const Route = createFileRoute("/courses/$slug/learn/$lessonSlug")({
  head: () => ({
    meta: [
      { title: "Lesson | Minds Digital Legacy" },
      { name: "robots", content: "noindex" },
      // Not "no-referrer": the embedded player needs an origin (ADR-0005).
      { name: "referrer", content: "strict-origin-when-cross-origin" },
    ],
  }),
  component: LessonPage,
});

function LessonPage() {
  const { slug, lessonSlug } = Route.useParams();
  const client = useQueryClient();
  const lesson = useQuery({
    queryKey: ["lesson", slug, lessonSlug],
    retry: false,
    queryFn: async () => {
      const r = await academyApi.lesson(slug, lessonSlug);
      if (!r.ok) throw new Error(r.reason);
      return r.data.lesson;
    },
  });
  const complete = useMutation({
    mutationFn: async (completed: boolean) => {
      const r = await academyApi.saveProgress(slug, lessonSlug, { completed });
      if (!r.ok) throw new Error(r.reason);
      return r.data.enrolment;
    },
    onSuccess: async (e) => {
      client.setQueryData(["enrolment", slug], e);
      await client.invalidateQueries({ queryKey: ["lesson", slug, lessonSlug] });
      await client.invalidateQueries({ queryKey: ["learning"] });
    },
  });

  if (lesson.isPending)
    return (
      <p role="status" className="container-mdl py-16 text-muted-foreground">
        Loading lesson…
      </p>
    );
  if (lesson.isError || !lesson.data) {
    const reason = lesson.error?.message;
    return (
      <div className="container-mdl max-w-xl py-16">
        <h1 className="text-2xl font-bold text-primary">
          {reason === "unauthenticated"
            ? "Sign in to open this lesson"
            : reason === "forbidden"
              ? "Enrol to open this lesson"
              : "Lesson not available"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {reason === "unauthenticated" || reason === "forbidden"
            ? "Free to join. Your progress is saved to your account."
            : failureText(reason ?? "unavailable")}
        </p>
        <div className="mt-6 flex gap-3">
          {reason === "unauthenticated" ? (
            <Button asChild variant="gold">
              <Link to="/login">Sign in</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/courses/$slug" params={{ slug }}>
              Back to course
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const l = lesson.data;
  const done = l.progress?.status === "completed";
  const canTrack = l.canTrackProgress;
  return (
    <div className="container-mdl max-w-3xl py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link to="/courses/$slug" params={{ slug }} className="hover:underline">
          {l.course.title}
        </Link>
        <span aria-hidden> / </span>
        <span>
          Lesson {l.position.index} of {l.position.total}
        </span>
      </nav>
      <h1 className="mt-2 text-3xl font-bold text-primary">{l.title}</h1>
      <p className="mt-2 text-muted-foreground">{l.summary}</p>

      {l.video ? (
        <div className="mt-6">
          <YouTubeFacade videoId={l.video.videoId} title={l.title} />
        </div>
      ) : null}

      <div className="mt-8">
        <Blocks blocks={l.body} />
      </div>

      {l.transcript ? (
        <details className="mt-8 rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-semibold">Transcript</summary>
          <div className="mt-3 space-y-3 text-sm">
            {l.transcript.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </details>
      ) : null}

      {l.resources.length > 0 ? (
        <section className="mt-8" aria-labelledby="res">
          <h2 id="res" className="font-semibold">
            Further reading
          </h2>
          <ul className="mt-2 list-disc pl-6 text-sm">
            {l.resources.map((r) => (
              <li key={r.url}>
                <a className="underline" href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        {l.previous ? (
          <Button asChild variant="outline">
            <Link
              to="/courses/$slug/learn/$lessonSlug"
              params={{ slug, lessonSlug: l.previous.slug }}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {canTrack ? (
          <Button
            variant={done ? "outline" : "gold"}
            disabled={complete.isPending}
            aria-pressed={done}
            onClick={() => complete.mutate(!done)}
          >
            <Check className="h-4 w-4" aria-hidden />
            {done ? "Completed (undo)" : "Mark as complete"}
          </Button>
        ) : (
          <Button asChild variant="gold">
            <Link to="/courses/$slug" params={{ slug }}>
              Enrol to track progress
            </Link>
          </Button>
        )}
        {l.next ? (
          <Button asChild variant="outline">
            <Link to="/courses/$slug/learn/$lessonSlug" params={{ slug, lessonSlug: l.next.slug }}>
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : (
          <span />
        )}
      </div>
      {complete.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {failureText(complete.error.message)}
        </p>
      ) : null}
    </div>
  );
}
