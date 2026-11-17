import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InternshipsTabs } from "@/components/admin/InternshipsTabs";
import { useCan } from "@/components/admin/meta";
import {
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  PageHeader,
  Pagination,
  SelectFilter,
  StatusBadge,
  inputCls,
  selectCls,
} from "@/components/admin/ui";
import { adminApi, formatDate, useAdminAction, useAdminQuery } from "@/lib/admin";
import type { Page } from "@/lib/admin";
import { PLACEMENT_STATUS_LABEL, averageRating } from "@/lib/internships";
import type { AdminPlacement, AdminPosting, SupervisorRow } from "@/lib/internships";

export const Route = createFileRoute("/admin/internships/placements")({
  component: PlacementsPage,
});

function EndDialog({ placement, onClose }: { placement: AdminPlacement; onClose: () => void }) {
  const { run, busy } = useAdminAction();
  const [status, setStatus] = useState<"completed" | "ended_early" | "cancelled">("completed");
  const [summary, setSummary] = useState("");

  const submit = async () => {
    const result = await run(
      () =>
        adminApi.post(`/internships/placements/${placement.id}/end`, {
          status,
          ...(summary.trim() === "" ? {} : { summary: summary.trim() }),
        }),
      { success: "Placement ended.", refresh: ["/internships"] },
    );
    if (result.ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End placement</DialogTitle>
          <DialogDescription>
            {placement.intern?.displayName} · {placement.postingTitle}. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Field label="How did it end?">
          <select
            className={selectCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="completed">Completed</option>
            <option value="ended_early">Ended early</option>
            <option value="cancelled">Cancelled before it started</option>
          </select>
        </Field>
        <Field
          label="Short wrap-up (the intern can see this)"
          hint="What they achieved or why it ended. Optional."
        >
          <textarea
            className={`${inputCls} min-h-24`}
            value={summary}
            maxLength={1000}
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>
        <Button variant="destructive" disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "End placement"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  placement,
  onClose,
}: {
  placement: AdminPlacement;
  onClose: () => void;
}) {
  const { run, busy } = useAdminAction();
  const [supervisorId, setSupervisorId] = useState("");
  const posting = useAdminQuery<{ posting: AdminPosting }>(
    `/internships/postings/${placement.postingId}`,
  );
  const load = useAdminQuery<{ items: SupervisorRow[] }>("/internships/supervisors");
  const options = (posting.data?.posting.supervisors ?? []).filter(
    (s) => s.id !== placement.supervisor.id,
  );

  const submit = async () => {
    const result = await run(
      () => adminApi.post(`/internships/placements/${placement.id}/supervisor`, { supervisorId }),
      { success: "Supervisor changed.", refresh: ["/internships"] },
    );
    if (result.ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change supervisor</DialogTitle>
          <DialogDescription>
            Only supervisors assigned to this posting, with spare capacity, can take over.
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No other supervisor is assigned to this posting.
          </p>
        ) : (
          <Field label="New supervisor">
            <select
              className={selectCls}
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
            >
              <option value="">Choose…</option>
              {options.map((s) => {
                const row = load.data?.items.find((r) => r.id === s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {row ? ` (${String(row.active)} of ${String(row.capacity)} interns)` : ""}
                  </option>
                );
              })}
            </select>
          </Field>
        )}
        <Button disabled={busy || supervisorId === ""} onClick={() => void submit()}>
          {busy ? "Saving…" : "Change supervisor"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function PlacementsPage() {
  const canPlace = useCan("internships:place");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [ending, setEnding] = useState<AdminPlacement | null>(null);
  const [reassigning, setReassigning] = useState<AdminPlacement | null>(null);
  const [viewing, setViewing] = useState<AdminPlacement | null>(null);

  const query = useAdminQuery<Page<AdminPlacement>>("/internships/placements", {
    status: status || undefined,
    page,
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Placements"
        description="Interns who are placed with a supervisor. Ending a placement removes the intern role when it was their last one."
      />
      <InternshipsTabs />

      <FilterBar
        onReset={() => {
          setStatus("active");
          setPage(1);
        }}
        active={status !== "active"}
      >
        <SelectFilter
          label="Status"
          value={status}
          allLabel="All"
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={["active", "completed", "ended_early", "cancelled"]}
        />
      </FilterBar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Internship placements"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(p) => p.id}
            empty={
              <EmptyState
                title="No placements"
                text="Place an applicant from the Applications tab once they accept an offer."
              />
            }
            columns={[
              {
                key: "intern",
                header: "Intern",
                cell: (p) => (
                  <span className="font-medium">{p.intern?.displayName ?? "Removed account"}</span>
                ),
              },
              { key: "posting", header: "Posting", cell: (p) => p.postingTitle ?? "-" },
              { key: "sup", header: "Supervisor", cell: (p) => p.supervisor.displayName },
              {
                key: "dates",
                header: "Dates",
                cell: (p) => `${formatDate(p.startsOn)} to ${formatDate(p.endsOn)}`,
              },
              { key: "status", header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
              {
                key: "fb",
                header: "Feedback",
                cell: (p) => {
                  const avg = averageRating(p.feedback.map((f) => f.rating));
                  return `${String(p.feedback.length)}${avg === null ? "" : ` (avg ${String(avg)})`}`;
                },
              },
              {
                key: "actions",
                header: "Actions",
                cell: (p) => (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setViewing(p)}>
                      View
                    </Button>
                    {canPlace && p.status === "active" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setReassigning(p)}>
                          Supervisor
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEnding(p)}>
                          End
                        </Button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
          {query.data && (
            <Pagination
              page={query.data.page}
              pageSize={query.data.pageSize}
              total={query.data.total}
              onPage={setPage}
            />
          )}
        </>
      )}

      {ending && <EndDialog placement={ending} onClose={() => setEnding(null)} />}
      {reassigning && (
        <ReassignDialog placement={reassigning} onClose={() => setReassigning(null)} />
      )}

      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.intern?.displayName}</DialogTitle>
                <DialogDescription>
                  {viewing.postingTitle} · {PLACEMENT_STATUS_LABEL[viewing.status]}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>
                  Supervisor: {viewing.supervisor.displayName}. {formatDate(viewing.startsOn)} to{" "}
                  {formatDate(viewing.endsOn)}.
                </p>
                {viewing.outcomeSummary && (
                  <p className="rounded-md border border-border bg-muted p-3">
                    {viewing.outcomeSummary}
                  </p>
                )}
                <h3 className="font-semibold">Supervisor feedback</h3>
                {viewing.feedback.length === 0 ? (
                  <p className="text-muted-foreground">No feedback yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {viewing.feedback.map((f, i) => (
                      <li
                        key={`${f.at}-${String(i)}`}
                        className="rounded-md border border-border p-2"
                      >
                        <p>{f.text}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(f.at, true)}
                          {f.rating !== undefined && ` · ${String(f.rating)} / 5`}
                          {f.visibleToIntern ? " · shared with intern" : " · staff only"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
