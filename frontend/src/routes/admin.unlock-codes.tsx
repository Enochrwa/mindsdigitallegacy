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
import { useCan } from "@/components/admin/meta";
import {
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  inputCls,
  selectCls,
} from "@/components/admin/ui";
import {
  UNLOCK_KINDS,
  adminApi,
  dateToIso,
  formatDate,
  humanize,
  isoToDateInput,
  personLabel,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type { Course, Page, Person, UnlockCodeRow } from "@/lib/admin";

export const Route = createFileRoute("/admin/unlock-codes")({ component: UnlockCodesPage });

function UnlockCodesPage() {
  const canManage = useCan("unlock:manage");
  const canCourses = useCan("courses:read");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UnlockCodeRow | "new" | null>(null);
  const [history, setHistory] = useState<UnlockCodeRow | null>(null);
  const { run, busy } = useAdminAction();
  const query = useAdminQuery<Page<UnlockCodeRow>>("/unlock-codes", { q, page, pageSize: 25 });
  const courses = useAdminQuery<Page<Course>>("/courses", { pageSize: 100 }, canCourses);
  const courseName = (id: string) =>
    courses.data?.items.find((c) => c.id === id)?.title ?? "a course";

  return (
    <>
      <PageHeader
        title="Unlock codes"
        description="Codes for ambassadors, partner schools and promotions. Each unlocks free training without the referral threshold."
        actions={
          canManage && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus aria-hidden /> New code
            </Button>
          )
        }
      />
      <FilterBar>
        <SearchInput
          value={q}
          label="Find a code"
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
            caption="Unlock codes"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(c) => c.id}
            empty={
              <EmptyState
                title="No unlock codes yet"
                text="Create one for a partner school or an ambassador."
              />
            }
            columns={[
              {
                key: "c",
                header: "Code",
                cell: (c) => <span className="font-mono font-medium">{c.code}</span>,
              },
              { key: "l", header: "Given to", cell: (c) => c.label },
              { key: "k", header: "Type", cell: (c) => humanize(c.kind) },
              {
                key: "u",
                header: "Used",
                cell: (c) => `${c.usedCount}${c.maxUses === null ? "" : ` / ${c.maxUses}`}`,
              },
              {
                key: "e",
                header: "Expires",
                cell: (c) => (c.expiresAt ? formatDate(c.expiresAt) : "Never"),
              },
              {
                key: "s",
                header: "Covers",
                cell: (c) =>
                  c.courseIds.length === 0 ? "All courses" : c.courseIds.map(courseName).join(", "),
              },
              {
                key: "st",
                header: "Status",
                cell: (c) => {
                  const expired = c.expiresAt !== undefined && new Date(c.expiresAt) < new Date();
                  const spent = c.maxUses !== null && c.usedCount >= c.maxUses;
                  return (
                    <StatusBadge
                      value={expired ? "expired" : spent ? "used up" : c.status}
                      tone={expired || spent ? "warn" : undefined}
                    />
                  );
                },
              },
              {
                key: "a",
                header: "",
                cell: (c) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setHistory(c)}>
                      Redemptions
                    </Button>
                    {canManage && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                adminApi.patch(`/unlock-codes/${c.id}`, {
                                  status: c.status === "active" ? "disabled" : "active",
                                }),
                              {
                                success: c.status === "active" ? "Code disabled." : "Code enabled.",
                                refresh: ["/unlock-codes"],
                              },
                            )
                          }
                        >
                          {c.status === "active" ? "Disable" : "Enable"}
                        </Button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <Pagination page={page} pageSize={25} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <CodeDialog
        target={editing}
        courses={courses.data?.items ?? []}
        onClose={() => setEditing(null)}
      />
      <HistoryDialog code={history} onClose={() => setHistory(null)} />
    </>
  );
}

function CodeDialog({
  target,
  courses,
  onClose,
}: {
  target: UnlockCodeRow | "new" | null;
  courses: Course[];
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {target !== null && (
          <CodeForm
            key={target === "new" ? "new" : target.id}
            target={target}
            courses={courses}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CodeForm({
  target,
  courses,
  onClose,
}: {
  target: UnlockCodeRow | "new";
  courses: Course[];
  onClose: () => void;
}) {
  const isNew = target === "new";
  const existing = isNew ? null : target;
  const { run, busy } = useAdminAction();
  const [kind, setKind] = useState<string>(existing?.kind ?? "partner");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [code, setCode] = useState("");
  const [unlimited, setUnlimited] = useState(existing ? existing.maxUses === null : false);
  const [maxUses, setMaxUses] = useState(String(existing?.maxUses ?? 50));
  const [expires, setExpires] = useState(isoToDateInput(existing?.expiresAt));
  const [slugs, setSlugs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const uses = unlimited ? null : Number.parseInt(maxUses, 10);
    if (!unlimited && (!Number.isInteger(uses) || (uses ?? 0) < 1)) {
      setError("Enter a number of uses of at least 1, or choose unlimited.");
      return;
    }
    const result = isNew
      ? await run(
          () =>
            adminApi.post("/unlock-codes", {
              kind,
              label: label.trim(),
              ...(code.trim() ? { code: code.trim() } : {}),
              maxUses: uses,
              expiresAt: dateToIso(expires),
              courseSlugs: slugs,
            }),
          { success: "Code created.", refresh: ["/unlock-codes"] },
        )
      : await run(
          () =>
            adminApi.patch(`/unlock-codes/${existing?.id}`, {
              label: label.trim(),
              maxUses: uses,
              expiresAt: dateToIso(expires),
            }),
          { success: "Code updated.", refresh: ["/unlock-codes"] },
        );
    if (result.ok) onClose();
    else if (result.reason === "validation")
      setError(
        "Check the values: the code must be 4-24 letters or digits and the label at least 2 characters.",
      );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{isNew ? "New unlock code" : `Edit ${existing?.code}`}</DialogTitle>
        <DialogDescription>
          {isNew
            ? "Leave the code empty to generate a random one. People type it on the invite page."
            : "The code itself and the courses it covers cannot change. Create a new code for that."}
        </DialogDescription>
      </DialogHeader>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Field label="Given to (name or institution)">
        <input
          className={inputCls}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          minLength={2}
          maxLength={120}
          required
        />
      </Field>
      {isNew && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>
              {UNLOCK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {humanize(k)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Custom code (optional)" hint="4-24 letters or digits">
            <input
              className={`${inputCls} font-mono uppercase`}
              value={code}
              maxLength={24}
              pattern="[A-Za-z0-9]{4,24}"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Maximum uses">
          <input
            className={inputCls}
            type="number"
            min={1}
            max={100000}
            value={maxUses}
            disabled={unlimited}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </Field>
        <Field label="Expires on (optional)">
          <input
            className={inputCls}
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => setUnlimited(e.target.checked)}
        />{" "}
        Unlimited uses
      </label>
      {isNew && courses.length > 0 && (
        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Courses it unlocks</legend>
          <p className="mb-2 text-xs text-muted-foreground">
            Leave all unticked to unlock every gated course.
          </p>
          <div className="grid max-h-40 gap-1 overflow-y-auto">
            {courses.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={slugs.includes(c.slug)}
                  onChange={(e) =>
                    setSlugs(
                      e.target.checked ? [...slugs, c.slug] : slugs.filter((s) => s !== c.slug),
                    )
                  }
                />
                {c.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {isNew ? "Create code" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function HistoryDialog({ code, onClose }: { code: UnlockCodeRow | null; onClose: () => void }) {
  const query = useAdminQuery<{ items: { at: string; user: Person }[] }>(
    `/unlock-codes/${code?.id ?? "none"}/redemptions`,
    undefined,
    code !== null,
  );
  return (
    <Dialog open={code !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Redemptions of {code?.code}</DialogTitle>
          <DialogDescription>Who used this code, newest first.</DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <DataTable
            caption="Redemptions"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(r) => `${r.user.id}-${r.at}`}
            empty={<EmptyState title="Not used yet" />}
            columns={[
              { key: "u", header: "Person", cell: (r) => personLabel(r.user) },
              { key: "a", header: "When", cell: (r) => formatDate(r.at, true) },
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
