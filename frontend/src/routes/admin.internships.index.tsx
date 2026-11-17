import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
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
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  PageHeader,
  Pagination,
  SelectFilter,
  Stat,
  StatusBadge,
  inputCls,
  selectCls,
} from "@/components/admin/ui";
import {
  adminApi,
  dateToIso,
  formatDate,
  isoToDateInput,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type { Page } from "@/lib/admin";
import {
  COMPENSATION,
  COMPENSATION_LABEL,
  DEPARTMENTS,
  DEPARTMENT_LABEL,
  MODE_LABEL,
  WORK_MODES,
  capacityHint,
  parseLines,
} from "@/lib/internships";
import type {
  AdminPosting,
  Compensation,
  Department,
  InternshipStats,
  SupervisorRow,
  WorkMode,
} from "@/lib/internships";

export const Route = createFileRoute("/admin/internships/")({ component: PostingsPage });

interface FormState {
  title: string;
  department: Department;
  summary: string;
  description: string;
  requirements: string;
  learningGoals: string;
  mode: WorkMode;
  location: string;
  durationWeeks: string;
  hoursPerWeek: string;
  compensation: Compensation;
  compensationNote: string;
  minAge: "16" | "18";
  slots: string;
  supervisorIds: string[];
  opensAt: string;
  closesAt: string;
}

const EMPTY: FormState = {
  title: "",
  department: "software_web",
  summary: "",
  description: "",
  requirements: "",
  learningGoals: "",
  mode: "hybrid",
  location: "Kigali",
  durationWeeks: "8",
  hoursPerWeek: "20",
  compensation: "unpaid",
  compensationNote: "",
  minAge: "16",
  slots: "1",
  supervisorIds: [],
  opensAt: "",
  closesAt: "",
};

const fromPosting = (p: AdminPosting): FormState => ({
  title: p.title,
  department: p.department,
  summary: p.summary,
  description: p.description,
  requirements: p.requirements.join("\n"),
  learningGoals: p.learningGoals.join("\n"),
  mode: p.mode,
  location: p.location,
  durationWeeks: String(p.durationWeeks),
  hoursPerWeek: String(p.hoursPerWeek),
  compensation: p.compensation,
  compensationNote: p.compensationNote,
  minAge: String(p.minAge) as "16" | "18",
  slots: String(p.slots),
  supervisorIds: p.supervisorIds,
  opensAt: isoToDateInput(p.opensAt),
  closesAt: isoToDateInput(p.closesAt),
});

function toBody(f: FormState): Record<string, unknown> {
  const opens = dateToIso(f.opensAt);
  const closes = dateToIso(f.closesAt);
  return {
    title: f.title.trim(),
    department: f.department,
    summary: f.summary.trim(),
    description: f.description.trim(),
    requirements: parseLines(f.requirements),
    learningGoals: parseLines(f.learningGoals),
    mode: f.mode,
    location: f.location.trim(),
    durationWeeks: Number(f.durationWeeks),
    hoursPerWeek: Number(f.hoursPerWeek),
    compensation: f.compensation,
    compensationNote: f.compensationNote.trim(),
    minAge: Number(f.minAge),
    slots: Number(f.slots),
    supervisorIds: f.supervisorIds,
    ...(opens === null ? {} : { opensAt: opens }),
    ...(closes === null ? {} : { closesAt: closes }),
  };
}

function PostingForm({
  initial,
  supervisors,
  perSupervisor,
  busy,
  onSubmit,
}: {
  initial: FormState;
  supervisors: SupervisorRow[];
  perSupervisor: number;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((cur) => ({ ...cur, [key]: value }));
  const hint = capacityHint(f.supervisorIds.length, Number(f.slots) || 0, perSupervisor);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(toBody(f));
      }}
    >
      <Field label="Title" className="sm:col-span-2">
        <input
          className={inputCls}
          value={f.title}
          maxLength={100}
          required
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <Field label="Department">
        <select
          className={selectCls}
          value={f.department}
          onChange={(e) => set("department", e.target.value as Department)}
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABEL[d]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Where">
        <select
          className={selectCls}
          value={f.mode}
          onChange={(e) => set("mode", e.target.value as WorkMode)}
        >
          {WORK_MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Short summary"
        hint="One or two sentences for the list page (20 to 300 characters)."
        className="sm:col-span-2"
      >
        <input
          className={inputCls}
          value={f.summary}
          maxLength={300}
          required
          onChange={(e) => set("summary", e.target.value)}
        />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea
          className={`${inputCls} min-h-28`}
          value={f.description}
          maxLength={4000}
          required
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <Field label="Requirements" hint="One per line.">
        <textarea
          className={`${inputCls} min-h-24`}
          value={f.requirements}
          onChange={(e) => set("requirements", e.target.value)}
        />
      </Field>
      <Field label="What the intern will learn" hint="One per line.">
        <textarea
          className={`${inputCls} min-h-24`}
          value={f.learningGoals}
          onChange={(e) => set("learningGoals", e.target.value)}
        />
      </Field>
      <Field label="Location">
        <input
          className={inputCls}
          value={f.location}
          maxLength={100}
          required
          onChange={(e) => set("location", e.target.value)}
        />
      </Field>
      <Field label="Minimum age">
        <select
          className={selectCls}
          value={f.minAge}
          onChange={(e) => set("minAge", e.target.value as "16" | "18")}
        >
          <option value="16">16 (under-18s need a verified guardian)</option>
          <option value="18">18</option>
        </select>
      </Field>
      <Field label="Weeks">
        <input
          type="number"
          min={2}
          max={26}
          className={inputCls}
          value={f.durationWeeks}
          onChange={(e) => set("durationWeeks", e.target.value)}
        />
      </Field>
      <Field label="Hours per week">
        <input
          type="number"
          min={4}
          max={40}
          className={inputCls}
          value={f.hoursPerWeek}
          onChange={(e) => set("hoursPerWeek", e.target.value)}
        />
      </Field>
      <Field label="Pay">
        <select
          className={selectCls}
          value={f.compensation}
          onChange={(e) => set("compensation", e.target.value as Compensation)}
        >
          {COMPENSATION.map((c) => (
            <option key={c} value={c}>
              {COMPENSATION_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Pay note (optional)">
        <input
          className={inputCls}
          value={f.compensationNote}
          maxLength={300}
          onChange={(e) => set("compensationNote", e.target.value)}
        />
      </Field>
      <Field label="Places">
        <input
          type="number"
          min={1}
          max={20}
          className={inputCls}
          value={f.slots}
          onChange={(e) => set("slots", e.target.value)}
        />
      </Field>
      <div />
      <Field label="Opens (optional)">
        <input
          type="date"
          className={inputCls}
          value={f.opensAt}
          onChange={(e) => set("opensAt", e.target.value)}
        />
      </Field>
      <Field label="Closes (optional)">
        <input
          type="date"
          className={inputCls}
          value={f.closesAt}
          onChange={(e) => set("closesAt", e.target.value)}
        />
      </Field>

      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium">Supervisors</legend>
        <p className="text-xs text-muted-foreground">
          No supervisor, no intern. Each supervisor can guide up to {perSupervisor} interns at once.
        </p>
        {supervisors.length === 0 ? (
          <p className="mt-2 text-sm text-destructive">
            No supervisors yet. Give someone the Supervisor role under Users first.
          </p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {supervisors.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={f.supervisorIds.includes(s.id)}
                  onChange={(e) =>
                    set(
                      "supervisorIds",
                      e.target.checked
                        ? [...f.supervisorIds, s.id]
                        : f.supervisorIds.filter((x) => x !== s.id),
                    )
                  }
                />
                <span>
                  {s.displayName}
                  <span className="block text-xs text-muted-foreground">
                    {s.active} of {s.capacity} interns now
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {hint && <p className="mt-2 text-xs text-destructive">{hint}</p>}
      </fieldset>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save posting"}
        </Button>
      </div>
    </form>
  );
}

function PostingsPage() {
  const canWrite = useCan("internships:write");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminPosting | "new" | null>(null);
  const [confirm, setConfirm] = useState<{
    posting: AdminPosting;
    action: "publish" | "close";
  } | null>(null);
  const { run, busy } = useAdminAction();

  const stats = useAdminQuery<InternshipStats>("/internships/stats");
  const supervisors = useAdminQuery<{ items: SupervisorRow[] }>("/internships/supervisors");
  const query = useAdminQuery<Page<AdminPosting>>("/internships/postings", {
    status: status || undefined,
    page,
    pageSize: 20,
  });
  const perSupervisor = supervisors.data?.items[0]?.capacity ?? 3;

  const save = async (body: Record<string, unknown>) => {
    const call =
      editing === "new"
        ? () => adminApi.post<{ posting: AdminPosting }>("/internships/postings", body)
        : () =>
            adminApi.patch<{ posting: AdminPosting }>(
              `/internships/postings/${(editing as AdminPosting).id}`,
              body,
            );
    const result = await run(call, { success: "Posting saved.", refresh: ["/internships"] });
    if (result.ok) setEditing(null);
  };

  const changeState = async () => {
    if (confirm === null) return;
    const { posting, action } = confirm;
    const result = await run(() => adminApi.post(`/internships/postings/${posting.id}/${action}`), {
      success: action === "publish" ? "Posting is now live." : "Posting closed.",
      refresh: ["/internships"],
    });
    if (result.ok) setConfirm(null);
  };

  return (
    <>
      <PageHeader
        title="Internships"
        description="Open a place only when there is a project and a supervisor to guide it."
        actions={
          canWrite && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus aria-hidden /> New posting
            </Button>
          )
        }
      />
      <InternshipsTabs />

      {stats.data && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Open postings"
            value={stats.data.postings.published}
            hint={`${String(stats.data.postings.draft)} draft`}
          />
          <Stat
            label="Applications"
            value={stats.data.totalApplications}
            hint={`${String(stats.data.applications.submitted)} to review`}
          />
          <Stat
            label="Offer rate"
            value={`${String(stats.data.offerRate)}%`}
            hint="offered, accepted or placed"
          />
          <Stat label="Interns now" value={stats.data.activePlacements} />
        </div>
      )}

      {stats.data && stats.data.supervisors.length > 0 && (
        <section
          aria-label="Supervisor load"
          className="mb-6 rounded-xl border border-border bg-card p-4"
        >
          <h2 className="text-sm font-semibold">Supervisor capacity</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stats.data.supervisors.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                {s.name}
                <StatusBadge
                  value={`${String(s.active)} of ${String(s.capacity)}`}
                  tone={s.active >= s.capacity ? "warn" : "good"}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <FilterBar
        onReset={() => {
          setStatus("");
          setPage(1);
        }}
        active={status !== ""}
      >
        <SelectFilter
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={["draft", "published", "closed"]}
        />
      </FilterBar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Internship postings"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(p) => p.id}
            empty={
              <EmptyState
                title="No postings yet"
                text="Create one, assign a supervisor, then publish it."
              />
            }
            columns={[
              {
                key: "title",
                header: "Posting",
                cell: (p) => (
                  <>
                    <span className="font-medium">{p.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {DEPARTMENT_LABEL[p.department]}
                    </span>
                  </>
                ),
              },
              { key: "status", header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
              { key: "slots", header: "Places", cell: (p) => String(p.slots) },
              {
                key: "sup",
                header: "Supervisors",
                cell: (p) =>
                  p.supervisors.length === 0
                    ? "None yet"
                    : p.supervisors.map((s) => s.name).join(", "),
              },
              { key: "closes", header: "Closes", cell: (p) => formatDate(p.closesAt) },
              {
                key: "actions",
                header: "Actions",
                cell: (p) =>
                  canWrite && (
                    <div className="flex gap-2">
                      {p.status !== "closed" && (
                        <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                      )}
                      {p.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => setConfirm({ posting: p, action: "publish" })}
                        >
                          Publish
                        </Button>
                      )}
                      {p.status === "published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirm({ posting: p, action: "close" })}
                        >
                          Close
                        </Button>
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

      <Dialog open={editing !== null} onOpenChange={(o) => !busy && !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "New internship posting" : "Edit posting"}
            </DialogTitle>
            <DialogDescription>It stays hidden until you publish it.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <PostingForm
              initial={editing === "new" ? EMPTY : fromPosting(editing)}
              supervisors={supervisors.data?.items ?? []}
              perSupervisor={perSupervisor}
              busy={busy}
              onSubmit={(body) => void save(body)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.action === "publish" ? "Publish this internship?" : "Close this internship?"
        }
        description={
          confirm?.action === "publish"
            ? "It becomes visible to everyone and applications open. Capacity is checked first."
            : "No new applications will be accepted. Applications already in progress continue."
        }
        confirmLabel={confirm?.action === "publish" ? "Publish" : "Close posting"}
        busy={busy}
        onConfirm={() => void changeState()}
      />
    </>
  );
}
