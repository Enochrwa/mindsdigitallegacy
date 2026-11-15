import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ExportButton } from "@/components/admin/ExportButton";
import { useCan } from "@/components/admin/meta";
import {
  DataTable,
  ErrorState,
  FilterBar,
  PageHeader,
  Pagination,
  SearchInput,
  SelectFilter,
  StatusBadge,
} from "@/components/admin/ui";
import { ROLES, formatDate, useAdminQuery } from "@/lib/admin";
import type { AdminUser, Page } from "@/lib/admin";

export const Route = createFileRoute("/admin/users/")({ component: UsersPage });

const STATES = ["active", "unverified", "suspended", "deleted"] as const;

function UsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const canExport = useCan("export:data");
  const query = useAdminQuery<Page<AdminUser>>("/users", { q, role, status, page, pageSize: 25 });
  const reset = () => {
    setQ("");
    setRole("");
    setStatus("");
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with an account. Open a person to manage roles, access and sessions."
        actions={canExport && <ExportButton kind="users" />}
      />
      <FilterBar onReset={reset} active={q !== "" || role !== "" || status !== ""}>
        <SearchInput
          value={q}
          label="Search name or email"
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <SelectFilter
          label="Role"
          value={role}
          options={ROLES}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        />
        <SelectFilter
          label="Status"
          value={status}
          options={STATES}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </FilterBar>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Users"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(u) => u.id}
            columns={[
              {
                key: "name",
                header: "Name",
                cell: (u) => (
                  <Link
                    to="/admin/users/$id"
                    params={{ id: u.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {u.displayName}
                  </Link>
                ),
              },
              { key: "email", header: "Email", cell: (u) => u.email },
              {
                key: "roles",
                header: "Roles",
                cell: (u) => u.roles.filter((r) => r !== "learner").join(", ") || "learner",
              },
              { key: "state", header: "Status", cell: (u) => <StatusBadge value={u.state} /> },
              { key: "mfa", header: "2-step", cell: (u) => (u.mfaEnabled ? "On" : "-") },
              { key: "joined", header: "Joined", cell: (u) => formatDate(u.createdAt) },
            ]}
          />
          <Pagination page={page} pageSize={25} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </>
  );
}
