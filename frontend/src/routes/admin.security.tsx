import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMeta } from "@/components/admin/meta";
import { Notice, PageHeader, Panel } from "@/components/admin/ui";
import { formatDate, humanize, useAdminQuery } from "@/lib/admin";
import type { AuditRow, Page } from "@/lib/admin";

export const Route = createFileRoute("/admin/security")({ component: SecurityPage });

function SecurityPage() {
  const meta = useMeta();
  const [showAll, setShowAll] = useState(false);
  const canAudit = meta.permissions.includes("audit:read");
  const mine = useAdminQuery<Page<AuditRow>>(
    "/audit",
    { actorId: meta.user.id, page: 1, pageSize: showAll ? 50 : 10 },
    canAudit,
  );
  const low = meta.mfa.recoveryCodesLeft <= 2;
  const roles = meta.user.roles.filter((r) => r !== "learner");

  return (
    <>
      <PageHeader
        title="My security"
        description="How your staff account is protected. Everything you do in the console is recorded under your name."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Two-step verification">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
            On and confirmed for this session
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            You confirm a code from your authenticator app each time you sign in, and again after 12
            hours of use.
          </p>
          <div className="mt-4">
            <p className="text-sm">
              Recovery codes left:{" "}
              <strong className="tabular-nums">{meta.mfa.recoveryCodesLeft}</strong> of 10
            </p>
            {low && (
              <div className="mt-3">
                <Notice kind="error">
                  <p className="flex items-center gap-1 font-medium">
                    <ShieldAlert className="h-4 w-4" aria-hidden /> Running low on recovery codes
                  </p>
                  <p className="mt-1">
                    If you lose your phone with no codes left, only another admin can reset your
                    two-step verification. Ask one to reset it and set it up again to get a fresh
                    set of ten.
                  </p>
                </Notice>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Your access">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{meta.user.displayName}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{meta.user.email}</dd>
            <dt className="text-muted-foreground">Roles</dt>
            <dd>{roles.length > 0 ? roles.map(humanize).join(", ") : "Learner"}</dd>
          </dl>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">
              What I can do ({meta.permissions.length} permissions)
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {[...meta.permissions].sort().map((p) => (
                <li key={p} className="font-mono text-xs">
                  {p}
                </li>
              ))}
            </ul>
          </details>
          <div className="mt-4 flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/account">Change password and account settings</Link>
            </Button>
          </div>
        </Panel>
      </div>

      {canAudit && (
        <Panel
          title="My recent activity"
          description="If you see something you did not do, tell an admin straight away."
          className="mt-4"
          actions={
            <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : "Show more"}
            </Button>
          }
        >
          {mine.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading…
            </p>
          ) : mine.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load your activity.
            </p>
          ) : mine.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {mine.data.items.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {humanize(e.action)}
                    {e.outcome === "failure" && (
                      <span className="ml-2 text-xs text-destructive">failed</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(e.at, true)} · {e.ipPrefix || "-"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}
