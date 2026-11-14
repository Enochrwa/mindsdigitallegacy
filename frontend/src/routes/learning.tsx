import { useEffect } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/site/Layout";
import { CourseCardView } from "@/components/academy/CourseCardView";
import { academyApi } from "@/lib/academy";
import { authHead } from "@/components/auth/helpers";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/learning")({
  head: authHead("My learning"),
  component: LearningPage,
});

function LearningPage() {
  const session = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.status === "anonymous") void navigate({ to: "/login", replace: true });
  }, [session.status, navigate]);
  const query = useQuery({
    queryKey: ["learning"],
    enabled: session.status === "authenticated",
    queryFn: async () => {
      const r = await academyApi.learning();
      if (!r.ok) throw new Error(r.reason);
      return r.data.items;
    },
  });
  return (
    <>
      <PageHero
        eyebrow="MDL Digital Academy"
        title="My learning"
        text="Pick up where you left off."
      />
      <section className="container-mdl py-12">
        {query.isPending ? (
          <p role="status" className="text-muted-foreground">
            Loading…
          </p>
        ) : null}
        {query.data && query.data.length === 0 ? (
          <div>
            <p className="text-muted-foreground">You have not enrolled in a course yet.</p>
            <Button asChild variant="gold" className="mt-4">
              <Link to="/courses">Browse courses</Link>
            </Button>
          </div>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {query.data?.map((i) => (
            <CourseCardView key={i.course.slug} course={i.course} enrolment={i.enrolment} />
          ))}
        </div>
      </section>
    </>
  );
}
