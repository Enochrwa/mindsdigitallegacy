import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";
import { authHead } from "@/components/auth/helpers";
import { looksLikeCode, normaliseCode, referralApi, rememberCode } from "@/lib/referrals";

export const Route = createFileRoute("/r/$code")({
  head: authHead("You have been invited"),
  component: InviteLanding,
});

/**
 * Landing page for a shared invite link. It remembers the code, tells the server once (POST, so
 * link previews are not counted), and never says whether the code is real: an invalid or expired
 * link looks the same, and registration simply proceeds without credit.
 */
function InviteLanding() {
  const { code: raw } = Route.useParams();
  const code = normaliseCode(raw);
  const valid = looksLikeCode(code);

  useEffect(() => {
    if (!valid) return;
    rememberCode(code);
    void referralApi.visit(code);
  }, [code, valid]);

  const site = useQuery({
    queryKey: ["site"],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await referralApi.site();
      return r.ok ? r.data : null;
    },
  });
  const closed = site.data?.registrationOpen === false;

  return (
    <AuthShell
      eyebrow="Invitation"
      title="A friend invited you to learn"
      text="Minds Digital Legacy teaches practical digital skills. Create a free account to start."
    >
      <p className="text-sm text-muted-foreground">
        When you verify your email, your friend gets credit towards unlocking free courses. You also
        get access to our open courses straight away.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {closed ? (
          <p role="status" className="text-sm">
            Registration is paused for now. Please check back soon.
          </p>
        ) : (
          <Button asChild variant="gold">
            <Link to="/register">Create your free account</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/courses">Browse courses first</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
