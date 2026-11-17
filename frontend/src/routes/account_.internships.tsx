import { useEffect } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/site/Layout";
import { ApplicationCard } from "@/components/internships/ApplicationCard";
import { PlacementCard } from "@/components/internships/PlacementCard";
import { authHead } from "@/components/auth/helpers";
import { KEYS, internshipsApi } from "@/lib/internships";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/account_/internships")({
  head: authHead("My internships"),
  component: MyInternshipsPage,
});

function MyInternshipsPage() {
  const session = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.status === "anonymous") void navigate({ to: "/login", replace: true });
  }, [session.status, navigate]);
  const enabled = session.status === "authenticated";

  const applications = useQuery({
    queryKey: KEYS.mine,
    enabled,
    queryFn: async () => {
      const r = await internshipsApi.myApplications();
      if (!r.ok) throw new Error(r.reason);
      return r.data.items;
    },
  });
  const placements = useQuery({
    queryKey: KEYS.placements,
    enabled,
    queryFn: async () => {
      const r = await internshipsApi.myPlacements();
      if (!r.ok) throw new Error(r.reason);
      return r.data.items;
    },
  });

  return (
    <>
      <PageHero
        eyebrow="Internships"
        title="My internships"
        text="Follow your applications and your placement."
      />
      <div className="container-mdl space-y-12 py-12">
        {placements.data && placements.data.length > 0 && (
          <section aria-labelledby="placements-heading">
            <h2 id="placements-heading" className="text-2xl font-bold text-primary">
              Your placements
            </h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {placements.data.map((p) => (
                <PlacementCard key={p.id} placement={p} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="applications-heading">
          <h2 id="applications-heading" className="text-2xl font-bold text-primary">
            Your applications
          </h2>
          {applications.isPending && enabled && (
            <p role="status" className="mt-4 text-muted-foreground">
              Loading…
            </p>
          )}
          {applications.isError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              We could not load your applications. Please reload the page.
            </p>
          )}
          {applications.data && applications.data.length === 0 && (
            <div className="mt-4">
              <p className="text-muted-foreground">You have not applied for an internship yet.</p>
              <Button asChild variant="gold" className="mt-4">
                <Link to="/internships">See open internships</Link>
              </Button>
            </div>
          )}
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {applications.data?.map((a) => (
              <ApplicationCard key={a.id} application={a} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
