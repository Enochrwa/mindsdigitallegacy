import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BarsChart, ShareBars, TrendChart } from "@/components/admin/Charts";
import { useCan } from "@/components/admin/meta";
import {
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  Panel,
  Stat,
} from "@/components/admin/ui";
import { useAdminQuery } from "@/lib/admin";
import type { Overview } from "@/lib/admin";

export const Route = createFileRoute("/admin/")({ component: OverviewPage });

const RANGES = [7, 30, 90, 365] as const;
const FUNNEL = [
  "visit",
  "attributed",
  "qualified",
  "needs_review",
  "approved",
  "rejected",
  "revoked",
  "unlocked",
] as const;

function OverviewPage() {
  const [days, setDays] = useState<number>(30);
  const query = useAdminQuery<Overview>("/overview", { days });
  const canSeeReferrals = useCan("referrals:read");
  const canSeeLeads = useCan("leads:read");

  return (
    <>
      <PageHeader
        title="Overview"
        description="How the platform is doing: sign-ups, learning, leads and the referral loop."
        actions={
          <div role="group" aria-label="Time range" className="flex gap-1">
            {RANGES.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={days === r ? "default" : "outline"}
                aria-pressed={days === r}
                onClick={() => setDays(r)}
              >
                {r === 365 ? "1 year" : `${r} days`}
              </Button>
            ))}
          </div>
        }
      />
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Body data={query.data} canSeeReferrals={canSeeReferrals} canSeeLeads={canSeeLeads} />
      )}
    </>
  );
}

function Body({
  data,
  canSeeReferrals,
  canSeeLeads,
}: {
  data: Overview;
  canSeeReferrals: boolean;
  canSeeLeads: boolean;
}) {
  const funnel = data.referrals.funnel.byType;
  const funnelData = FUNNEL.map((k) => ({ label: k.replace("_", " "), value: funnel[k] ?? 0 }));
  const newLeads = data.leads.byStatus["new"] ?? 0;
  const published = data.courses.byStatus["published"] ?? 0;
  const variants = Object.entries(data.referrals.funnel.byVariant);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Registered users"
          value={data.users.total}
          hint={`${data.users.verified} verified${data.users.suspended > 0 ? `, ${data.users.suspended} suspended` : ""}`}
        />
        <Stat label="Published courses" value={published} />
        {canSeeLeads && (
          <Stat
            label="New leads"
            value={newLeads}
            hint={
              <Link to="/admin/leads" className="underline">
                Open pipeline
              </Link>
            }
          />
        )}
        {canSeeLeads && (
          <Stat
            label="Overdue follow-ups"
            value={data.leads.overdueFollowUps}
            tone={data.leads.overdueFollowUps > 0 ? "warn" : undefined}
          />
        )}
        {canSeeReferrals && (
          <Stat
            label="Referrals to review"
            value={data.referrals.reviewQueue}
            tone={data.referrals.reviewQueue > 0 ? "warn" : undefined}
            hint={
              <Link to="/admin/referrals" className="underline">
                Open review queue
              </Link>
            }
          />
        )}
        {canSeeReferrals && (
          <Stat
            label="Referral qualification rate"
            value={`${data.referrals.qualificationRate}%`}
            hint="Qualified of attributed, in this period"
          />
        )}
      </div>

      <Panel title={`Trends, last ${data.days} days`}>
        <div className="grid gap-6 md:grid-cols-2">
          <TrendChart title="Sign-ups" data={data.series.signups} />
          <TrendChart title="Enrolments" data={data.series.enrolments} color="var(--chart-2)" />
          {canSeeLeads && (
            <TrendChart title="Leads" data={data.series.leads} color="var(--chart-3)" />
          )}
          {canSeeReferrals && (
            <TrendChart
              title="Qualified referrals"
              data={data.series.qualifiedReferrals}
              color="var(--chart-4)"
            />
          )}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {canSeeReferrals && (
          <Panel title="Referral funnel" description="Events in the selected period.">
            <BarsChart title="Referral funnel" data={funnelData} />
            {variants.length > 1 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium">By threshold variant (A/B)</h3>
                <DataTable
                  caption="Referral funnel by assigned threshold"
                  rows={variants}
                  rowKey={([k]) => k}
                  columns={[
                    {
                      key: "v",
                      header: "Variant",
                      cell: ([k]) => (k === "default" ? "Default" : `${k} invitees`),
                    },
                    { key: "a", header: "Attributed", cell: ([, v]) => v["attributed"] ?? 0 },
                    { key: "q", header: "Qualified", cell: ([, v]) => v["qualified"] ?? 0 },
                    { key: "u", header: "Unlocked", cell: ([, v]) => v["unlocked"] ?? 0 },
                  ]}
                />
              </div>
            )}
          </Panel>
        )}
        {canSeeLeads && (
          <Panel title="Leads by status">
            {Object.keys(data.leads.byStatus).length === 0 ? (
              <EmptyState title="No leads yet" />
            ) : (
              <ShareBars counts={data.leads.byStatus} />
            )}
            {Object.keys(data.leads.byKind).length > 0 && (
              <>
                <h3 className="mb-2 mt-5 text-sm font-medium">By type</h3>
                <ShareBars counts={data.leads.byKind} />
              </>
            )}
          </Panel>
        )}
      </div>

      <Panel title="Courses" description="Learners and completion per course.">
        <DataTable
          caption="Per-course learners and completion rate"
          rows={data.courses.perCourse}
          rowKey={(c) => c.slug}
          empty={<EmptyState title="No courses yet" />}
          columns={[
            { key: "t", header: "Course", cell: (c) => c.title },
            { key: "a", header: "Active", cell: (c) => c.active },
            { key: "c", header: "Completed", cell: (c) => c.completed },
            { key: "l", header: "Locked", cell: (c) => c.locked },
            { key: "r", header: "Completion", cell: (c) => `${c.completionRate}%` },
          ]}
        />
      </Panel>
    </div>
  );
}
