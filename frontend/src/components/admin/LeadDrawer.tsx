import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCan } from "./meta";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  PageSkeleton,
  StatusBadge,
  inputCls,
  selectCls,
} from "./ui";
import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  adminApi,
  dateToIso,
  formatDate,
  humanize,
  isoToDateInput,
  parseList,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type { Lead, LeadPriority, LeadStatus } from "@/lib/admin";

export interface Staffer {
  id: string;
  displayName: string;
}

/** Side panel with the whole lead: edit pipeline fields, read the message, keep a notes timeline. */
export function LeadDrawer({
  leadId,
  staff,
  onClose,
}: {
  leadId: string | null;
  staff: Staffer[];
  onClose: () => void;
}) {
  return (
    <Sheet open={leadId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {leadId !== null && <DrawerBody leadId={leadId} staff={staff} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  leadId,
  staff,
  onClose,
}: {
  leadId: string;
  staff: Staffer[];
  onClose: () => void;
}) {
  const query = useAdminQuery<{ lead: Lead; staffNames: Record<string, string> }>(
    `/leads/${leadId}`,
  );
  const canWrite = useCan("leads:write");
  const { run, busy } = useAdminAction();
  const lead = query.data?.lead;
  const names = query.data?.staffNames ?? {};

  const [status, setStatus] = useState<LeadStatus>("new");
  const [priority, setPriority] = useState<LeadPriority>("normal");
  const [assignee, setAssignee] = useState("");
  const [tags, setTags] = useState("");
  const [follow, setFollow] = useState("");
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setStatus(lead.status);
    setPriority(lead.priority);
    setAssignee(lead.assignedTo ?? "");
    setTags(lead.tags.join(", "));
    setFollow(isoToDateInput(lead.followUpAt));
  }, [lead]);

  if (query.isPending)
    return (
      <>
        <SheetHeader>
          <SheetTitle>Lead</SheetTitle>
        </SheetHeader>
        <PageSkeleton rows={4} />
      </>
    );
  if (query.isError || !lead)
    return query.isError ? (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    ) : null;

  const save = async () => {
    const body: Record<string, unknown> = {};
    if (status !== lead.status) body["status"] = status;
    if (priority !== lead.priority) body["priority"] = priority;
    if (assignee !== (lead.assignedTo ?? ""))
      body["assignedTo"] = assignee === "" ? null : assignee;
    const nextTags = parseList(tags).slice(0, 10);
    if (nextTags.join() !== lead.tags.join()) body["tags"] = nextTags;
    if (follow !== isoToDateInput(lead.followUpAt)) body["followUpAt"] = dateToIso(follow);
    if (Object.keys(body).length === 0) return;
    await run(() => adminApi.patch(`/leads/${lead.id}`, body), {
      success: "Lead updated.",
      refresh: ["/leads", "/overview"],
    });
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await run(
      () => adminApi.post(`/leads/${lead.id}/notes`, { text: note.trim() }),
      {
        success: "Note added.",
        refresh: ["/leads"],
      },
    );
    if (result.ok) setNote("");
  };

  const details: [string, string | undefined][] = [
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Organisation", lead.organization],
    ["Service", lead.service],
    ["Budget", lead.budget],
    ["Partner type", lead.partnerType],
    ["Interest", lead.interest],
    ["Age group", lead.ageBracket ? humanize(lead.ageBracket) : undefined],
    ["Guardian contact", lead.guardianContact],
    ["Received", formatDate(lead.createdAt, true)],
  ];

  return (
    <div className="space-y-5 px-1 pb-6">
      <SheetHeader>
        <SheetTitle>{lead.fullName}</SheetTitle>
        <SheetDescription>
          {humanize(lead.kind)} <StatusBadge value={lead.status} />
        </SheetDescription>
      </SheetHeader>

      <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
        {details
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
      </dl>
      {lead.message && (
        <blockquote className="whitespace-pre-wrap rounded-md border-l-4 border-accent bg-muted p-3 text-sm">
          {lead.message}
        </blockquote>
      )}

      <fieldset disabled={!canWrite || busy} className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">Pipeline</legend>
        <Field label="Status">
          <select
            className={selectCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select
            className={selectCls}
            value={priority}
            onChange={(e) => setPriority(e.target.value as LeadPriority)}
          >
            {LEAD_PRIORITIES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assigned to">
          <select
            className={selectCls}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
            {assignee !== "" && !staff.some((s) => s.id === assignee) && (
              <option value={assignee}>{names[assignee] ?? "Current assignee"}</option>
            )}
          </select>
        </Field>
        <Field label="Follow up on">
          <input
            type="date"
            className={inputCls}
            value={follow}
            onChange={(e) => setFollow(e.target.value)}
          />
        </Field>
        <Field label="Tags" hint="Comma separated, up to 10" className="sm:col-span-2">
          <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        {canWrite && (
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={() => void save()} disabled={busy}>
              Save changes
            </Button>
            <Button
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden /> Delete lead
            </Button>
          </div>
        )}
      </fieldset>

      <section aria-labelledby="notes-h">
        <h3 id="notes-h" className="mb-2 text-sm font-semibold">
          Notes ({lead.notes.length})
        </h3>
        <ol className="space-y-2">
          {[...lead.notes].reverse().map((n, i) => (
            <li key={`${n.at}-${i}`} className="rounded-md border border-border p-2 text-sm">
              <p className="whitespace-pre-wrap">{n.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {names[n.by] ?? "Staff"} · {formatDate(n.at, true)}
              </p>
            </li>
          ))}
          {lead.notes.length === 0 && (
            <li className="text-sm text-muted-foreground">No notes yet.</li>
          )}
        </ol>
        {canWrite && (
          <form onSubmit={addNote} className="mt-3 space-y-2">
            <Field label="Add a note">
              <textarea
                className={inputCls}
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <Button type="submit" size="sm" disabled={busy || note.trim() === ""}>
              Add note
            </Button>
          </form>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this lead?"
        description="This permanently removes the request, including its notes. Use it when the person asks us to erase their data."
        confirmLabel="Delete permanently"
        destructive
        busy={busy}
        onConfirm={async () => {
          const result = await run(() => adminApi.del(`/leads/${lead.id}`), {
            success: "Lead deleted.",
            refresh: ["/leads", "/overview"],
          });
          if (result.ok) onClose();
        }}
      />
    </div>
  );
}
