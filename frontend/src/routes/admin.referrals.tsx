import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportButton } from "@/components/admin/ExportButton";
import { useCan } from "@/components/admin/meta";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  Pagination,
  SearchInput,
  SelectFilter,
  Stat,
  StatusBadge,
} from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import {
  REFERRAL_STATUSES,
  REJECT_REASONS,
  adminApi,
  formatDate,
  humanize,
  personLabel,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type { Overview, Page, Person, ReferralCodeRow, ReferralRow } from "@/lib/admin";

export const Route = createFileRoute("/admin/referrals")({ component: ReferralsPage });

function PersonLink({ person }: { person: Person }) {
  return (
    <Link to="/admin/users/$id" params={{ id: person.id }} className="text-primary hover:underline">
      {personLabel(person)}
    </Link>
  );
}

function ReferralsPage() {
  const canReview = useCan("referrals:review");
  const canExport = useCan("export:data");
  const canStats = useCan("analytics:read");
  const stats = useAdminQuery<Overview>("/overview", { days: 30 }, canStats);
  const byType = stats.data?.referrals.funnel.byType ?? {};
  const [tab, setTab] = useState("queue");

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Invitations that unlock free training. Suspicious ones wait here for a human decision; people never see why a referral did not count."
        actions={canExport && <ExportButton kind="referrals" />}
      />
      {canStats && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Link visits (30d)" value={byType["visit"] ?? 0} />
          <Stat label="Sign-ups attributed" value={byType["attributed"] ?? 0} />
          <Stat
            label="Qualified"
            value={byType["qualified"] ?? 0}
            hint={`${stats.data?.referrals.qualificationRate ?? 0}% of attributed`}
          />
          <Stat
            label="Needs review"
            value={stats.data?.referrals.reviewQueue ?? 0}
            tone={(stats.data?.referrals.reviewQueue ?? 0) > 0 ? "warn" : undefined}
          />
          <Stat label="Unlocks" value={byType["unlocked"] ?? 0} />
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">Review queue</TabsTrigger>
          <TabsTrigger value="all">All referrals</TabsTrigger>
          <TabsTrigger value="codes">Referral codes</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-4">
          <ReferralTable fixedStatus="needs_review" canReview={canReview} />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <ReferralTable canReview={canReview} />
        </TabsContent>
        <TabsContent value="codes" className="mt-4">
          <CodesTable canReview={canReview} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ReferralTable({ fixedStatus, canReview }: { fixedStatus?: string; canReview: boolean }) {
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [reject, setReject] = useState<ReferralRow | null>(null);
  const { run, busy } = useAdminAction();
  const query = useAdminQuery<Page<ReferralRow>>("/referrals", {
    status: fixedStatus ?? status,
    reason,
    page,
    pageSize: 25,
  });

  const columns: Column<ReferralRow>[] = [
    { key: "inv", header: "Invitee", cell: (r) => <PersonLink person={r.invitee} /> },
    { key: "ref", header: "Referrer", cell: (r) => <PersonLink person={r.referrer} /> },
    { key: "code", header: "Code", cell: (r) => <span className="font-mono">{r.code}</span> },
    { key: "st", header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
    { key: "why", header: "Why", cell: (r) => (r.reason ? humanize(r.reason) : "-") },
    { key: "net", header: "Network", cell: (r) => r.network ?? "-" },
    { key: "at", header: "Created", cell: (r) => formatDate(r.createdAt, true) },
  ];
  if (canReview)
    columns.push({
      key: "act",
      header: "Decision",
      cell: (r) => (
        <div className="flex gap-1">
          {r.status === "needs_review" && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() => adminApi.post(`/referrals/${r.id}/approve`), {
                  success: "Referral approved and counted.",
                  refresh: ["/referrals", "/overview"],
                })
              }
            >
              Approve
            </Button>
          )}
          {(r.status === "needs_review" || r.status === "pending" || r.status === "qualified") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setReject(r)}>
              {r.status === "qualified" ? "Revoke" : "Reject"}
            </Button>
          )}
        </div>
      ),
    });

  return (
    <>
      {fixedStatus === undefined && (
        <FilterBar
          onReset={() => {
            setStatus("");
            setReason("");
            setPage(1);
          }}
          active={status !== "" || reason !== ""}
        >
          <SelectFilter
            label="Status"
            value={status}
            options={REFERRAL_STATUSES}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
          <SelectFilter
            label="Reason"
            value={reason}
            options={REJECT_REASONS}
            onChange={(v) => {
              setReason(v);
              setPage(1);
            }}
          />
        </FilterBar>
      )}
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            caption={fixedStatus ? "Referrals waiting for review" : "Referrals"}
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(r) => r.id}
            columns={columns}
            empty={
              <EmptyState
                title={fixedStatus ? "Nothing waiting for review" : "No referrals match"}
                text={
                  fixedStatus
                    ? "Referrals that trip a limit (same network, too fast) appear here."
                    : undefined
                }
              />
            }
          />
          <Pagination page={page} pageSize={25} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      <ConfirmDialog
        open={reject !== null}
        onOpenChange={(o) => !o && setReject(null)}
        title={reject?.status === "qualified" ? "Revoke this referral?" : "Reject this referral?"}
        description={
          reject?.status === "qualified"
            ? "It stops counting. If the referrer drops below their threshold, their free access is withdrawn."
            : "It will not count. Neither person is told."
        }
        confirmLabel={reject?.status === "qualified" ? "Revoke" : "Reject"}
        destructive
        busy={busy}
        onConfirm={async () => {
          if (reject === null) return;
          await run(() => adminApi.post(`/referrals/${reject.id}/reject`), {
            success: "Decision recorded.",
            refresh: ["/referrals", "/overview"],
          });
        }}
      />
    </>
  );
}

function CodesTable({ canReview }: { canReview: boolean }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { run, busy } = useAdminAction();
  const query = useAdminQuery<Page<ReferralCodeRow>>("/referral-codes", { q, page, pageSize: 25 });
  return (
    <>
      <FilterBar>
        <SearchInput
          value={q}
          label="Find a code"
          placeholder="e.g. K7M2PQRX"
          onSearch={(v) => {
            setQ(v.toUpperCase());
            setPage(1);
          }}
        />
      </FilterBar>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Referral codes"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(c) => c.id}
            empty={
              <EmptyState
                title="No codes yet"
                text="Codes are created when a learner opens their invite page."
              />
            }
            columns={[
              {
                key: "c",
                header: "Code",
                cell: (c) => <span className="font-mono">{c.code}</span>,
              },
              { key: "o", header: "Owner", cell: (c) => <PersonLink person={c.owner} /> },
              { key: "s", header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
              { key: "t", header: "Threshold", cell: (c) => c.assignedThreshold ?? "Default" },
              {
                key: "n",
                header: "Invitees",
                cell: (c) =>
                  Object.entries(c.counts)
                    .map(([k, v]) => `${v} ${humanize(k).toLowerCase()}`)
                    .join(", ") || "-",
              },
              { key: "d", header: "Created", cell: (c) => formatDate(c.createdAt) },
              {
                key: "a",
                header: "",
                cell: (c) =>
                  canReview ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            adminApi.post(`/referral-codes/${c.id}/status`, {
                              status: c.status === "active" ? "disabled" : "active",
                            }),
                          {
                            success: c.status === "active" ? "Code disabled." : "Code enabled.",
                            refresh: ["/referral-codes"],
                          },
                        )
                      }
                    >
                      {c.status === "active" ? "Disable" : "Enable"}
                    </Button>
                  ) : null,
              },
            ]}
          />
          <Pagination page={page} pageSize={25} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </>
  );
}
