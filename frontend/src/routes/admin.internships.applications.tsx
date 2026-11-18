import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { toast } from "sonner";
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
  Notice,
  PageHeader,
  Pagination,
  PageSkeleton,
  SelectFilter,
  StatusBadge,
  inputCls,
  selectCls,
} from "@/components/admin/ui";
import {
  adminApi,
  formatDate,
  internshipExportUrl,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type { Page } from "@/lib/admin";
import { APPLICATION_STATUSES, STAFF_ACTION_LABEL, STAFF_NEXT } from "@/lib/internships";
import type { AdminApplication, AdminPlacement, AdminPosting } from "@/lib/internships";

export const Route = createFileRoute("/admin/internships/applications")({
  component: ApplicationsPage,
});

type Detail = {
  application: AdminApplication;
  staffNames: Record<string, string>;
  placement: AdminPlacement | null;
};

function ReviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const canReview = useCan("internships:review");
  const canPlace = useCan("internships:place");
  const { run, busy } = useAdminAction();
  const detail = useAdminQuery<Detail>(`/internships/applications/${id}`);
  const a = detail.data?.application;
  const posting = useAdminQuery<{ posting: AdminPosting }>(
    `/internships/postings/${a?.postingId ?? "none"}`,
    undefined,
    a !== undefined,
  );

  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [score, setScore] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const base = `/internships/applications/${id}`;
  const refresh = ["/internships"];

  const move = async (to: string) => {
    const result = await run(
      () =>
        adminApi.post(`${base}/transition`, {
          to,
          ...(message.trim() === "" ? {} : { message: message.trim() }),
          ...(note.trim() === "" ? {} : { note: note.trim() }),
        }),
      { success: "Status updated. The applicant has been emailed.", refresh },
    );
    if (result.ok) {
      setMessage("");
      setNote("");
    }
  };

  const addNote = async () => {
    const result = await run(
      () =>
        adminApi.post(`${base}/notes`, {
          text: noteText.trim(),
          ...(score === "" ? {} : { score: Number(score) }),
        }),
      { success: "Note saved (staff only).", refresh },
    );
    if (result.ok) {
      setNoteText("");
      setScore("");
    }
  };

  const verifyGuardian = () =>
    run(() => adminApi.post(`${base}/verify-guardian`), {
      success: "Guardian recorded as verified.",
      refresh,
    });

  const place = async () => {
    if (supervisorId === "" || startsOn === "" || endsOn === "") {
      toast.error("Choose a supervisor and both dates.");
      return;
    }
    await run(() => adminApi.post(`${base}/place`, { supervisorId, startsOn, endsOn }), {
      success: "Intern placed. They have been emailed.",
      refresh,
    });
  };

  const allowedSupervisors = posting.data?.posting.supervisors ?? [];

  return (
    <Dialog open onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{a?.applicant?.displayName ?? "Application"}</DialogTitle>
          <DialogDescription>{a?.postingTitle}</DialogDescription>
        </DialogHeader>

        {detail.isPending && <PageSkeleton rows={4} />}
        {detail.isError && (
          <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        )}

        {a && (
          <div className="space-y-6 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge value={a.status} />
              {a.averageScore !== undefined && <span>Average score {a.averageScore} / 5</span>}
              {a.applicant && (
                <span className="text-muted-foreground">
                  {a.applicant.email}
                  {a.applicant.phone ? ` · ${a.applicant.phone}` : ""}
                </span>
              )}
            </div>

            <section>
              <h3 className="font-semibold">Statement</h3>
              <p className="mt-1 whitespace-pre-line rounded-md border border-border bg-muted p-3">
                {a.statement}
              </p>
              {a.links.length > 0 && (
                <ul className="mt-2 list-disc pl-5">
                  {a.links.map((l) => (
                    <li key={l}>
                      <a
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="break-all underline"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {a.availableFrom && (
                <p className="mt-2 text-muted-foreground">
                  Can start from {formatDate(a.availableFrom)}
                </p>
              )}
            </section>

            {a.under18 && a.guardian && (
              <section className="rounded-md border border-border p-3">
                <h3 className="font-semibold">Under 18: parent or guardian</h3>
                <p className="mt-1">
                  {a.guardian.name} ({a.guardian.relationship}) · {a.guardian.contact}
                </p>
                {a.guardian.verifiedAt ? (
                  <p className="mt-1 text-success">Verified {formatDate(a.guardian.verifiedAt)}</p>
                ) : (
                  <div className="mt-2">
                    <p className="text-muted-foreground">
                      Speak to the guardian before placing this applicant.
                    </p>
                    {canPlace && (
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={() => void verifyGuardian()}
                        disabled={busy}
                      >
                        I have verified the guardian
                      </Button>
                    )}
                  </div>
                )}
              </section>
            )}

            {canReview && STAFF_NEXT[a.status].length > 0 && (
              <section className="rounded-md border border-border p-3">
                <h3 className="font-semibold">Move this application</h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Message to the applicant (optional)"
                    hint="Shown to them. Keep it kind and short."
                  >
                    <textarea
                      className={`${inputCls} min-h-16`}
                      value={message}
                      maxLength={500}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Private note (optional)"
                    hint="Staff only. Never shown to the applicant."
                  >
                    <textarea
                      className={`${inputCls} min-h-16`}
                      value={note}
                      maxLength={1000}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STAFF_NEXT[a.status].map((to) => (
                    <Button
                      key={to}
                      size="sm"
                      variant={to === "rejected" ? "outline" : "default"}
                      disabled={busy}
                      onClick={() => void move(to)}
                    >
                      {STAFF_ACTION_LABEL[to]}
                    </Button>
                  ))}
                </div>
              </section>
            )}

            {a.status === "accepted" && canPlace && (
              <section className="rounded-md border border-accent p-3">
                <h3 className="font-semibold">Place this intern</h3>
                <p className="text-muted-foreground">
                  Agreement accepted {formatDate(a.agreementAcceptedAt)} (version{" "}
                  {a.agreementVersion}).
                </p>
                {allowedSupervisors.length === 0 ? (
                  <Notice kind="error">
                    This posting has no supervisors, so nobody can be placed.
                  </Notice>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label="Supervisor">
                      <select
                        className={selectCls}
                        value={supervisorId}
                        onChange={(e) => setSupervisorId(e.target.value)}
                      >
                        <option value="">Choose…</option>
                        {allowedSupervisors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Starts">
                      <input
                        type="date"
                        className={inputCls}
                        value={startsOn}
                        onChange={(e) => setStartsOn(e.target.value)}
                      />
                    </Field>
                    <Field label="Ends">
                      <input
                        type="date"
                        className={inputCls}
                        value={endsOn}
                        onChange={(e) => setEndsOn(e.target.value)}
                      />
                    </Field>
                  </div>
                )}
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={busy || allowedSupervisors.length === 0}
                  onClick={() => void place()}
                >
                  Confirm placement
                </Button>
              </section>
            )}

            {detail.data?.placement && (
              <section className="rounded-md border border-border p-3">
                <h3 className="font-semibold">Placement</h3>
                <p>
                  {detail.data.placement.supervisor.displayName} ·{" "}
                  {formatDate(detail.data.placement.startsOn)} to{" "}
                  {formatDate(detail.data.placement.endsOn)} ·{" "}
                  <StatusBadge value={detail.data.placement.status} />
                </p>
              </section>
            )}

            <section>
              <h3 className="font-semibold">Review notes (staff only)</h3>
              {a.notes.length === 0 ? (
                <p className="mt-1 text-muted-foreground">No notes yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {a.notes.map((n, i) => (
                    <li
                      key={`${n.at}-${String(i)}`}
                      className="rounded-md border border-border p-2"
                    >
                      <p>{n.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {detail.data?.staffNames[n.by] ?? "Staff"} · {formatDate(n.at, true)}
                        {n.score !== undefined && ` · ${String(n.score)} / 5`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {canReview && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                  <Field label="Add a note">
                    <input
                      className={inputCls}
                      value={noteText}
                      maxLength={1000}
                      onChange={(e) => setNoteText(e.target.value)}
                    />
                  </Field>
                  <Field label="Score">
                    <select
                      className={selectCls}
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                    >
                      <option value="">None</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} / 5
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    size="sm"
                    disabled={busy || noteText.trim().length < 2}
                    onClick={() => void addNote()}
                  >
                    Save note
                  </Button>
                </div>
              )}
            </section>

            <section>
              <h3 className="font-semibold">History</h3>
              <ol className="mt-2 space-y-1 border-l-2 border-border pl-4">
                {a.timeline.map((t, i) => (
                  <li key={`${t.at}-${String(i)}`}>
                    {t.from ? `${t.from} → ` : ""}
                    <span className="font-medium">{t.to}</span>{" "}
                    <span className="text-muted-foreground">
                      {formatDate(t.at, true)} ·{" "}
                      {t.by === "system"
                        ? "system"
                        : (detail.data?.staffNames[t.by] ??
                          (t.by === a.applicant?.id ? "applicant" : "staff"))}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplicationsPage() {
  const canExport = useCan("export:data");
  const [status, setStatus] = useState("");
  const [postingId, setPostingId] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const postings = useAdminQuery<Page<AdminPosting>>("/internships/postings", { pageSize: 100 });
  const query = useAdminQuery<Page<AdminApplication>>("/internships/applications", {
    status: status || undefined,
    postingId: postingId || undefined,
    page,
    pageSize: 25,
  });

  const download = async () => {
    setExporting(true);
    try {
      const response = await fetch(
        internshipExportUrl({ status: status || undefined, postingId: postingId || undefined }),
        { credentials: "include" },
      );
      if (!response.ok) {
        toast.error(
          response.status === 403
            ? "You are not allowed to export this data."
            : "The export failed. Please try again.",
        );
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "mdl-internship-applications.csv";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded. This action is recorded in the audit log.");
    } catch {
      toast.error("We could not reach the server.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Applications"
        description="Review each application fairly: the applicant sees only the status and the message you choose to send."
        actions={
          canExport && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void download()}
              disabled={exporting}
            >
              <Download aria-hidden /> {exporting ? "Preparing…" : "Export CSV"}
            </Button>
          )
        }
      />
      <InternshipsTabs />

      <FilterBar
        onReset={() => {
          setStatus("");
          setPostingId("");
          setPage(1);
        }}
        active={status !== "" || postingId !== ""}
      >
        <SelectFilter
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={APPLICATION_STATUSES}
        />
        <SelectFilter
          label="Posting"
          value={postingId}
          onChange={(v) => {
            setPostingId(v);
            setPage(1);
          }}
          options={(postings.data?.items ?? []).map((p) => ({ value: p.id, label: p.title }))}
        />
      </FilterBar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Internship applications"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(a) => a.id}
            empty={
              <EmptyState
                title="No applications match"
                text="Applications appear here as soon as people apply."
              />
            }
            columns={[
              {
                key: "who",
                header: "Applicant",
                cell: (a) => (
                  <>
                    <span className="font-medium">
                      {a.applicant?.displayName ?? "Removed account"}
                    </span>
                    {a.under18 && (
                      <span className="ml-2 text-xs text-muted-foreground">under 18</span>
                    )}
                  </>
                ),
              },
              { key: "posting", header: "Posting", cell: (a) => a.postingTitle ?? "-" },
              { key: "status", header: "Status", cell: (a) => <StatusBadge value={a.status} /> },
              {
                key: "score",
                header: "Score",
                cell: (a) => (a.averageScore === undefined ? "-" : `${String(a.averageScore)} / 5`),
              },
              { key: "applied", header: "Applied", cell: (a) => formatDate(a.createdAt) },
              {
                key: "open",
                header: "",
                cell: (a) => (
                  <Button size="sm" variant="outline" onClick={() => setOpen(a.id)}>
                    Review
                  </Button>
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

      {open !== null && <ReviewDialog id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
