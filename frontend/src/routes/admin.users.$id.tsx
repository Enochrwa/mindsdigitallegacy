import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan, useMeta } from "@/components/admin/meta";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  PageSkeleton,
  Panel,
  StatusBadge,
  inputCls,
  selectCls,
} from "@/components/admin/ui";
import { ROLES, adminApi, formatDate, humanize, useAdminAction, useAdminQuery } from "@/lib/admin";
import type { Course, Page, Role, UserDetail } from "@/lib/admin";

export const Route = createFileRoute("/admin/users/$id")({ component: UserPage });

type Dialog = null | "suspend" | "sessions" | "mfa";

function UserPage() {
  const { id } = Route.useParams();
  const query = useAdminQuery<UserDetail>(`/users/${id}`);
  return (
    <>
      <Link
        to="/admin/users"
        className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All users
      </Link>
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Detail id={id} data={query.data} />
      )}
    </>
  );
}

function Detail({ id, data }: { id: string; data: UserDetail }) {
  const { user } = data;
  const me = useMeta();
  const canManage = useCan("users:manage");
  const canRoles = useCan("roles:manage");
  const canAccess = useCan("enrolments:manage");
  const isSelf = me.user.id === id;
  const { run, busy } = useAdminAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [roles, setRoles] = useState<Role[]>(user.roles);
  useEffect(() => setRoles(user.roles), [user.roles]);
  const rolesChanged = [...roles].sort().join() !== [...user.roles].sort().join();

  const saveRoles = () =>
    run(() => adminApi.put(`/users/${id}/roles`, { roles }), {
      success: "Roles updated. Their sessions were ended so the change applies right away.",
      refresh: ["/users"],
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.displayName}
        description={user.email}
        actions={
          <>
            <StatusBadge value={user.state} />
            {canManage && user.state === "suspended" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => adminApi.post(`/users/${id}/unsuspend`), {
                    success: "Account reinstated.",
                    refresh: ["/users"],
                  })
                }
              >
                Reinstate
              </Button>
            )}
            {canManage && user.state !== "suspended" && !isSelf && (
              <Button variant="destructive" size="sm" onClick={() => setDialog("suspend")}>
                Suspend
              </Button>
            )}
          </>
        }
      />

      {user.state === "suspended" && (
        <Notice kind="error">
          Suspended on {formatDate(user.suspendedAt, true)}
          {user.suspendedReason ? `: ${user.suspendedReason}` : ""}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Joined</dt>
            <dd>{formatDate(user.createdAt, true)}</dd>
            <dt className="text-muted-foreground">Email verified</dt>
            <dd>{user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : "Not yet"}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{user.phone ?? "-"}</dd>
            <dt className="text-muted-foreground">Age group</dt>
            <dd>{user.ageBracket === "under_16" ? "Under 16" : "16 or older"}</dd>
            {user.guardian && (
              <>
                <dt className="text-muted-foreground">Guardian</dt>
                <dd>
                  {user.guardian.email}{" "}
                  {user.guardian.consentAt ? (
                    <StatusBadge value="verified" />
                  ) : (
                    <StatusBadge value="pending" />
                  )}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Two-step</dt>
            <dd>{user.mfaEnabled ? "On" : "Off"}</dd>
            <dt className="text-muted-foreground">Failed sign-ins</dt>
            <dd>
              {user.failedLogins}
              {user.lockedUntil ? ` (locked until ${formatDate(user.lockedUntil, true)})` : ""}
            </dd>
          </dl>
          {canManage && !isSelf && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" onClick={() => setDialog("sessions")}>
                Sign out everywhere
              </Button>
              {canRoles && user.mfaEnabled && (
                <Button variant="outline" size="sm" onClick={() => setDialog("mfa")}>
                  Reset two-step
                </Button>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="Roles"
          description="Changing roles signs the person out so permissions apply immediately."
        >
          <fieldset disabled={!canRoles || isSelf || busy} className="space-y-2">
            <legend className="sr-only">Roles</legend>
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roles.includes(r)}
                  disabled={r === "learner"}
                  onChange={(e) =>
                    setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))
                  }
                />
                <span className="font-medium">{humanize(r)}</span>
                <span className="text-xs text-muted-foreground">{ROLE_HELP[r]}</span>
              </label>
            ))}
          </fieldset>
          {isSelf && (
            <p className="mt-3 text-xs text-muted-foreground">
              You cannot change your own roles. Ask another admin.
            </p>
          )}
          {canRoles && !isSelf && (
            <Button
              className="mt-4"
              size="sm"
              disabled={!rolesChanged || busy}
              onClick={() => void saveRoles()}
            >
              Save roles
            </Button>
          )}
        </Panel>
      </div>

      <AccessPanel id={id} data={data} canGrant={canAccess} />

      <Panel title="Enrolments">
        <DataTable
          caption="Course enrolments"
          rows={data.enrolments}
          rowKey={(e) => e.courseSlug}
          empty={<EmptyState title="Not enrolled in any course" />}
          columns={[
            { key: "c", header: "Course", cell: (e) => e.courseTitle },
            { key: "s", header: "Status", cell: (e) => <StatusBadge value={e.status} /> },
            {
              key: "a",
              header: "Access",
              cell: (e) => (
                <span>
                  <StatusBadge value={e.access} />
                  {e.via ? (
                    <span className="ml-1 text-xs text-muted-foreground">via {e.via}</span>
                  ) : null}
                </span>
              ),
            },
            { key: "e", header: "Enrolled", cell: (e) => formatDate(e.enrolledAt) },
            { key: "l", header: "Last activity", cell: (e) => formatDate(e.lastActivityAt) },
          ]}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Referrals">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Their code</dt>
            <dd className="font-mono">
              {data.referral.code ?? "-"}{" "}
              {data.referral.codeStatus && <StatusBadge value={data.referral.codeStatus} />}
            </dd>
            <dt className="text-muted-foreground">Threshold</dt>
            <dd>{data.referral.assignedThreshold ?? "Default"}</dd>
            <dt className="text-muted-foreground">Invitees</dt>
            <dd>
              {Object.entries(data.referral.counts).length === 0
                ? "None yet"
                : Object.entries(data.referral.counts)
                    .map(([k, v]) => `${v} ${humanize(k).toLowerCase()}`)
                    .join(", ")}
            </dd>
            <dt className="text-muted-foreground">Invited by</dt>
            <dd>
              {data.referral.invitedBy ? (
                <>
                  <Link
                    to="/admin/users/$id"
                    params={{ id: data.referral.invitedBy.referrerId }}
                    className="text-primary hover:underline"
                  >
                    Open referrer
                  </Link>{" "}
                  <StatusBadge value={data.referral.invitedBy.status} />
                  {data.referral.invitedBy.reason && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {humanize(data.referral.invitedBy.reason)}
                    </span>
                  )}
                </>
              ) : (
                "Nobody"
              )}
            </dd>
          </dl>
        </Panel>

        <Panel title="Recent activity" description="Their actions and actions taken on them.">
          {data.activity.length === 0 ? (
            <EmptyState title="No recorded activity" />
          ) : (
            <ol className="space-y-2 text-sm">
              {data.activity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                  <time className="text-xs text-muted-foreground" dateTime={a.at}>
                    {formatDate(a.at, true)}
                  </time>
                  <span className="font-medium">{humanize(a.action)}</span>
                  {a.outcome === "failure" && <StatusBadge value="failure" />}
                  {a.detail && <span className="text-muted-foreground">{a.detail}</span>}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={dialog === "suspend"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Suspend ${user.displayName}?`}
        description="They are signed out everywhere and cannot sign in until you reinstate them."
        confirmLabel="Suspend account"
        reasonLabel="Reason (kept in the audit log)"
        destructive
        busy={busy}
        onConfirm={async (reason) => {
          await run(() => adminApi.post(`/users/${id}/suspend`, { reason }), {
            success: "Account suspended.",
            refresh: ["/users"],
          });
        }}
      />
      <ConfirmDialog
        open={dialog === "sessions"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Sign this person out everywhere?"
        description="All of their devices will need to sign in again."
        confirmLabel="Sign out everywhere"
        busy={busy}
        onConfirm={async () => {
          await run(() => adminApi.post(`/users/${id}/revoke-sessions`), {
            success: "Sessions ended.",
            refresh: ["/users"],
          });
        }}
      />
      <ConfirmDialog
        open={dialog === "mfa"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Reset two-step verification?"
        description="For a colleague who lost their phone and recovery codes. They must set it up again at their next sign-in."
        confirmLabel="Reset"
        destructive
        busy={busy}
        onConfirm={async () => {
          await run(() => adminApi.post(`/users/${id}/mfa-reset`), {
            success: "Two-step verification reset.",
            refresh: ["/users"],
          });
        }}
      />
    </div>
  );
}

const ROLE_HELP: Record<Role, string> = {
  learner: "Always included",
  intern: "Internship programme",
  supervisor: "Internship supervision",
  support: "Leads, referrals, users (read)",
  editor: "Courses and content",
  admin: "Everything",
};

function AccessPanel({ id, data, canGrant }: { id: string; data: UserDetail; canGrant: boolean }) {
  const { run, busy } = useAdminAction();
  const [scope, setScope] = useState("all");
  const [note, setNote] = useState("");
  const courses = useAdminQuery<Page<Course>>("/courses", { pageSize: 100 }, canGrant);
  const active = data.entitlements.filter((e) => e.revokedAt === undefined);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await run(
      () =>
        adminApi.post(`/users/${id}/access`, {
          scope: scope === "all" ? "all" : { courseSlug: scope },
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      { success: "Access granted.", refresh: ["/users"] },
    );
    if (result.ok) setNote("");
  };

  return (
    <Panel
      title="Free-training access"
      description="Referral, code and manual grants. Revoking re-locks courses that are no longer covered."
    >
      <DataTable
        caption="Access grants"
        rows={data.entitlements}
        rowKey={(e) => e.id}
        empty={<EmptyState title="No grants" text="This person has not unlocked free training." />}
        columns={[
          {
            key: "s",
            header: "Covers",
            cell: (e) => (e.scope === "all" ? "All courses" : e.scope),
          },
          { key: "v", header: "Via", cell: (e) => humanize(e.via) },
          { key: "n", header: "Note", cell: (e) => e.note ?? "-" },
          { key: "g", header: "Granted", cell: (e) => formatDate(e.grantedAt) },
          {
            key: "st",
            header: "Status",
            cell: (e) =>
              e.revokedAt ? <StatusBadge value="revoked" /> : <StatusBadge value="active" />,
          },
          {
            key: "x",
            header: "",
            cell: (e) =>
              canGrant && !e.revokedAt ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() => adminApi.del(`/entitlements/${e.id}`), {
                      success: "Access revoked.",
                      refresh: ["/users"],
                    })
                  }
                >
                  Revoke
                </Button>
              ) : null,
          },
        ]}
      />
      {canGrant && (
        <form
          onSubmit={grant}
          className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
        >
          <Field label="Grant access to">
            <select className={selectCls} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">All courses</option>
              {(courses.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note (optional)">
            <input
              className={inputCls}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Scholarship, partner cohort…"
            />
          </Field>
          <Button
            type="submit"
            disabled={
              busy ||
              (active.length > 0 && scope === "all" && active.some((e) => e.scope === "all"))
            }
          >
            Grant
          </Button>
        </form>
      )}
    </Panel>
  );
}
