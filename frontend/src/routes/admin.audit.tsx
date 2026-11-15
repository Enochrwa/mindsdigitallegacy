import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  DataTable,
  DateFilter,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  Pagination,
  SelectFilter,
  StatusBadge,
} from "@/components/admin/ui";
import { AUDIT_ACTIONS, formatDate, humanize, useAdminQuery } from "@/lib/admin";
import type { AuditRow, Page } from "@/lib/admin";

export const Route = createFileRoute("/admin/audit")({ component: AuditPage });

const PAGE_SIZE = 50;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function AuditPage() {
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [actorId, setActorId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const idOk = (v: string) => v === "" || OBJECT_ID.test(v);
  const query = useAdminQuery<Page<AuditRow>>("/audit", {
    action,
    outcome,
    actorId: idOk(actorId) ? actorId : "",
    targetId: idOk(targetId) ? targetId : "",
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  });
  const filtered = [action, outcome, actorId, targetId, from, to].some((v) => v !== "");
  const set = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };
  const reset = () => {
    for (const fn of [setAction, setOutcome, setActorId, setTargetId, setFrom, setTo]) fn("");
    setPage(1);
  };
  const idField = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="block min-w-[12rem] text-xs font-medium text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="24-character id"
        maxLength={24}
        aria-invalid={!idOk(value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 font-mono text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-ring/30"
      />
      {!idOk(value) && (
        <span className="mt-1 block text-destructive">An id has 24 letters and digits.</span>
      )}
    </label>
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every sensitive action, who did it and when. Entries cannot be edited or deleted from the console."
      />
      <FilterBar onReset={reset} active={filtered}>
        <SelectFilter
          label="Action"
          value={action}
          onChange={set(setAction)}
          allLabel="Any action"
          options={AUDIT_ACTIONS.map((a) => ({ value: a, label: humanize(a) }))}
        />
        <SelectFilter
          label="Outcome"
          value={outcome}
          onChange={set(setOutcome)}
          options={["success", "failure"]}
        />
        {idField("Actor id", actorId, set(setActorId))}
        {idField("Target id", targetId, set(setTargetId))}
        <DateFilter label="From" value={from} onChange={set(setFrom)} />
        <DateFilter label="To" value={to} onChange={set(setTo)} />
      </FilterBar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Audit events, newest first"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(e) => e.id}
            empty={
              <EmptyState
                title="No events match"
                text="Try widening the dates or clearing a filter."
              />
            }
            columns={[
              { key: "w", header: "When", cell: (e) => formatDate(e.at, true) },
              {
                key: "a",
                header: "Who",
                cell: (e) =>
                  e.actorId ? (
                    <Link
                      to="/admin/users/$id"
                      params={{ id: e.actorId }}
                      className="text-primary hover:underline"
                    >
                      {e.actorName ?? e.actorId}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">System / visitor</span>
                  ),
              },
              { key: "c", header: "Action", cell: (e) => humanize(e.action) },
              { key: "o", header: "Result", cell: (e) => <StatusBadge value={e.outcome} /> },
              {
                key: "d",
                header: "Details",
                className: "max-w-xs",
                cell: (e) => (
                  <span className="text-xs text-muted-foreground">
                    {[e.meta?.targetType, e.meta?.detail, e.meta?.reason]
                      .filter((v): v is string => typeof v === "string" && v !== "")
                      .join(" · ") || "-"}
                  </span>
                ),
              },
              {
                key: "i",
                header: "Network",
                cell: (e) => <span className="font-mono text-xs">{e.ipPrefix || "-"}</span>,
              },
              {
                key: "r",
                header: "Request",
                cell: (e) => <span className="font-mono text-xs">{e.requestId.slice(0, 8)}</span>,
              },
            ]}
          />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data?.total ?? 0}
            onPage={setPage}
          />
        </>
      )}
    </>
  );
}
