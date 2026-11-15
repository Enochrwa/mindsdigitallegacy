import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Columns3, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/admin/ExportButton";
import { LeadDrawer } from "@/components/admin/LeadDrawer";
import type { Staffer } from "@/components/admin/LeadDrawer";
import { useCan } from "@/components/admin/meta";
import {
  DataTable,
  DateFilter,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  Pagination,
  SearchInput,
  SelectFilter,
  Skeleton,
  StatusBadge,
  selectCls,
} from "@/components/admin/ui";
import {
  LEAD_KINDS,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  adminApi,
  formatDate,
  humanize,
  isOverdue,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type { AdminUser, LeadList, LeadRow, LeadStatus, Page } from "@/lib/admin";

export const Route = createFileRoute("/admin/leads")({ component: LeadsPage });

interface Filters {
  q: string;
  status: string;
  kind: string;
  priority: string;
  assignedTo: string;
  tag: string;
  from: string;
  to: string;
  overdue: string;
}
const EMPTY: Filters = {
  q: "",
  status: "",
  kind: "",
  priority: "",
  assignedTo: "",
  tag: "",
  from: "",
  to: "",
  overdue: "",
};

function useStaff(): Staffer[] {
  const canRead = useCan("users:read");
  const support = useAdminQuery<Page<AdminUser>>(
    "/users",
    { role: "support", pageSize: 100 },
    canRead,
  );
  const admins = useAdminQuery<Page<AdminUser>>(
    "/users",
    { role: "admin", pageSize: 100 },
    canRead,
  );
  return useMemo(() => {
    const all = [...(support.data?.items ?? []), ...(admins.data?.items ?? [])];
    const seen = new Set<string>();
    return all
      .filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)))
      .map((u) => ({ id: u.id, displayName: u.displayName }));
  }, [support.data, admins.data]);
}

function LeadsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [view, setView] = useState<"table" | "board">("table");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const staff = useStaff();
  const canExport = useCan("export:data");
  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const pageSize = view === "board" ? 100 : 25;
  const query = useAdminQuery<LeadList>("/leads", {
    ...filters,
    // The board shows all columns at once, so the status filter would hide whole columns.
    status: view === "board" ? "" : filters.status,
    from: filters.from,
    to: filters.to,
    page,
    pageSize,
    sort: filters.overdue === "true" ? "followUp" : "newest",
  });
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY);
  const staffName = (id?: string) =>
    staff.find((s) => s.id === id)?.displayName ?? (id ? "Assigned" : "-");

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every contact, service request, partner enquiry and course or internship interest, from first message to outcome."
        actions={
          <>
            <div role="group" aria-label="View" className="flex gap-1">
              <Button
                size="sm"
                variant={view === "table" ? "default" : "outline"}
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <List aria-hidden /> Table
              </Button>
              <Button
                size="sm"
                variant={view === "board" ? "default" : "outline"}
                aria-pressed={view === "board"}
                onClick={() => setView("board")}
              >
                <Columns3 aria-hidden /> Board
              </Button>
            </div>
            {canExport && (
              <ExportButton
                kind="leads"
                filters={{
                  status: filters.status,
                  kind: filters.kind,
                  from: filters.from,
                  to: filters.to,
                  q: filters.q,
                }}
              />
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2" aria-label="Status summary">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => set({ status: filters.status === s ? "" : s })}
            aria-pressed={filters.status === s}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filters.status === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            {humanize(s)} <span className="tabular-nums">{query.data?.counts[s] ?? 0}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => set({ overdue: filters.overdue === "true" ? "" : "true" })}
          aria-pressed={filters.overdue === "true"}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            filters.overdue === "true"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border-destructive/40 text-destructive hover:bg-destructive/5"
          }`}
        >
          Overdue follow-ups <span className="tabular-nums">{query.data?.overdue ?? 0}</span>
        </button>
      </div>

      <FilterBar
        onReset={() => {
          setFilters(EMPTY);
          setPage(1);
        }}
        active={active}
      >
        <SearchInput
          value={filters.q}
          label="Search name, email, organisation"
          onSearch={(q) => set({ q })}
        />
        <SelectFilter
          label="Type"
          value={filters.kind}
          options={LEAD_KINDS}
          onChange={(kind) => set({ kind })}
        />
        <SelectFilter
          label="Priority"
          value={filters.priority}
          options={LEAD_PRIORITIES}
          onChange={(priority) => set({ priority })}
        />
        <SelectFilter
          label="Assignee"
          value={filters.assignedTo}
          options={[
            { value: "unassigned", label: "Unassigned" },
            ...staff.map((s) => ({ value: s.id, label: s.displayName })),
          ]}
          onChange={(assignedTo) => set({ assignedTo })}
        />
        <label className="block text-xs font-medium text-muted-foreground">
          Tag
          <input
            className="mt-1 w-28 rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
            value={filters.tag}
            maxLength={30}
            onChange={(e) => set({ tag: e.target.value.toLowerCase() })}
          />
        </label>
        <DateFilter label="From" value={filters.from} onChange={(from) => set({ from })} />
        <DateFilter label="To" value={filters.to} onChange={(to) => set({ to })} />
      </FilterBar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : view === "table" ? (
        <>
          <DataTable
            caption="Leads"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(l) => l.id}
            empty={<EmptyState title="No leads match" text="Change or reset the filters." />}
            columns={[
              {
                key: "n",
                header: "Name",
                cell: (l) => (
                  <button
                    type="button"
                    className="text-left font-medium text-primary hover:underline"
                    onClick={() => setOpen(l.id)}
                  >
                    {l.fullName}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {l.email}
                    </span>
                  </button>
                ),
              },
              { key: "k", header: "Type", cell: (l) => humanize(l.kind) },
              { key: "s", header: "Status", cell: (l) => <StatusBadge value={l.status} /> },
              { key: "p", header: "Priority", cell: (l) => <StatusBadge value={l.priority} /> },
              { key: "a", header: "Owner", cell: (l) => staffName(l.assignedTo) },
              {
                key: "f",
                header: "Follow-up",
                cell: (l) => (
                  <span
                    className={
                      isOverdue(l.followUpAt) && l.status !== "closed"
                        ? "font-medium text-destructive"
                        : ""
                    }
                  >
                    {formatDate(l.followUpAt)}
                  </span>
                ),
              },
              { key: "t", header: "Tags", cell: (l) => l.tags.join(", ") || "-" },
              { key: "c", header: "Received", cell: (l) => formatDate(l.createdAt) },
            ]}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.total ?? 0}
            onPage={setPage}
          />
        </>
      ) : query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Board
          rows={query.data?.items ?? []}
          total={query.data?.total ?? 0}
          staffName={staffName}
          onOpen={setOpen}
        />
      )}

      <LeadDrawer leadId={open} staff={staff} onClose={() => setOpen(null)} />
    </>
  );
}

/** Kanban-style columns. Moving a card uses the status menu on it, so it works with keyboard and screen reader. */
function Board({
  rows,
  total,
  staffName,
  onOpen,
}: {
  rows: LeadRow[];
  total: number;
  staffName: (id?: string) => string;
  onOpen: (id: string) => void;
}) {
  const { run, busy } = useAdminAction();
  const move = (id: string, status: LeadStatus) =>
    run(() => adminApi.patch(`/leads/${id}`, { status }), {
      success: `Moved to ${humanize(status)}.`,
      refresh: ["/leads", "/overview"],
    });
  return (
    <>
      {total > rows.length && (
        <p className="mb-2 text-xs text-muted-foreground">
          Showing the {rows.length} most recent of {total}. Use the filters to narrow the board.
        </p>
      )}
      <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
        {LEAD_STATUSES.map((s) => {
          const items = rows.filter((l) => l.status === s);
          return (
            <section
              key={s}
              aria-label={`${humanize(s)} leads`}
              className="min-w-[13rem] rounded-xl border border-border bg-muted/40 p-2"
            >
              <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                {humanize(s)}{" "}
                <span className="tabular-nums text-muted-foreground">{items.length}</span>
              </h3>
              <ul className="space-y-2">
                {items.map((l) => (
                  <li
                    key={l.id}
                    className="rounded-lg border border-border bg-card p-2 text-sm shadow-sm"
                  >
                    <button
                      type="button"
                      className="text-left font-medium text-primary hover:underline"
                      onClick={() => onOpen(l.id)}
                    >
                      {l.fullName}
                    </button>
                    <p className="text-xs text-muted-foreground">{humanize(l.kind)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <StatusBadge value={l.priority} />
                      {isOverdue(l.followUpAt) && s !== "closed" && s !== "converted" && (
                        <StatusBadge value="overdue" tone="bad" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{staffName(l.assignedTo)}</p>
                    <label className="mt-1 block text-xs text-muted-foreground">
                      <span className="sr-only">Move {l.fullName} to</span>
                      <select
                        className={`${selectCls} !mt-0 text-xs`}
                        value={l.status}
                        disabled={busy}
                        onChange={(e) => void move(l.id, e.target.value as LeadStatus)}
                      >
                        {LEAD_STATUSES.map((x) => (
                          <option key={x} value={x}>
                            {humanize(x)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="px-1 text-xs text-muted-foreground">Empty</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
