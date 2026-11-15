import { useState } from "react";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { authHead } from "@/components/auth/helpers";
import { AdminMetaContext } from "@/components/admin/meta";
import { MfaSetup, MfaVerify, RecoveryCodesScreen } from "@/components/admin/MfaGate";
import { ErrorState, PageSkeleton } from "@/components/admin/ui";
import { META_KEY, useAdminMeta } from "@/lib/admin";
import type { AdminModule } from "@/lib/admin";

export const Route = createFileRoute("/admin")({
  head: authHead("Admin console"),
  component: AdminLayout,
});

const GROUP_ORDER = ["Insights", "Growth", "Academy", "People", "System"];

function groupModules(modules: AdminModule[]): [string, AdminModule[]][] {
  const groups = new Map<string, AdminModule[]>();
  for (const m of modules) groups.set(m.group, [...(groups.get(m.group) ?? []), m]);
  return [...groups.entries()].sort(
    (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]),
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="container-mdl py-16">{children}</div>;
}

function AdminLayout() {
  const client = useQueryClient();
  const meta = useAdminMeta();
  const [codes, setCodes] = useState<string[] | null>(null);

  if (meta.isPending) {
    return (
      <Centered>
        <PageSkeleton />
      </Centered>
    );
  }

  if (meta.isError) {
    const failure = meta.error.failure;
    if (failure.reason === "unauthenticated") {
      return (
        <Centered>
          <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="font-display text-xl font-bold">Sign in to continue</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The admin console is for MDL staff. Sign in with your staff account.
            </p>
            <Button asChild className="mt-4">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </Centered>
      );
    }
    if (failure.reason === "forbidden") {
      return (
        <Centered>
          <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="font-display text-xl font-bold">This area is for staff</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account does not have access to the admin console. If you think it should, ask an
              admin to grant you a role.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/">Back to the site</Link>
            </Button>
          </div>
        </Centered>
      );
    }
    return (
      <Centered>
        <ErrorState
          error={meta.error}
          onRetry={() => void client.invalidateQueries({ queryKey: META_KEY })}
        />
      </Centered>
    );
  }

  const data = meta.data;
  if (codes !== null) {
    return <RecoveryCodesScreen codes={codes} onDone={() => setCodes(null)} />;
  }
  if (!data.mfa.enabled) return <MfaSetup onRecoveryCodes={setCodes} />;
  if (!data.mfa.verified) return <MfaVerify />;

  return (
    <AdminMetaContext.Provider value={data}>
      <div className="container-mdl grid gap-6 py-6 md:grid-cols-[14rem_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <nav aria-label="Admin sections" className="space-y-4">
            {groupModules(data.modules).map(([group, modules]) => (
              <div key={group}>
                <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                <ul className="mt-1 flex gap-1 overflow-x-auto md:flex-col">
                  {modules.map((m) => (
                    <li key={m.key}>
                      <Link
                        to={m.path as "/admin"}
                        activeOptions={{ exact: m.path === "/admin" }}
                        className="block whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium text-foreground/80 hover:bg-muted"
                        activeProps={{
                          className: "bg-primary/10 text-primary",
                          "aria-current": "page",
                        }}
                      >
                        {m.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <p className="mt-6 hidden px-2 text-xs text-muted-foreground md:block">
            Signed in as {data.user.displayName}
            <br />
            {data.user.roles.filter((r) => r !== "learner").join(", ") || "learner"}
          </p>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </AdminMetaContext.Provider>
  );
}
