import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ExportButton } from "@/components/admin/ExportButton";
import { useCan } from "@/components/admin/meta";
import {
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  Pagination,
  Panel,
  SelectFilter,
  StatusBadge,
} from "@/components/admin/ui";
import { ENROLMENT_STATUSES, formatDate, humanize, personLabel, useAdminQuery } from "@/lib/admin";
import type { CourseRow, EnrolmentRow, Page } from "@/lib/admin";

export const Route = createFileRoute("/admin/enrolments")({ component: EnrolmentsPage });

const PAGE_SIZE = 25;

function EnrolmentsPage() {
  const canExport = useCan("export:data");
  const canCourses = useCan("courses:read");
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState("");
  const [accessState, setAccessState] = useState("");
  const [page, setPage] = useState(1);

  const courses = useAdminQuery<Page<CourseRow>>("/courses", { pageSize: 100 }, canCourses);
  const query = useAdminQuery<Page<EnrolmentRow>>("/enrolments", {
    courseId,
    status,
    accessState,
    page,
    pageSize: PAGE_SIZE,
  });
  const filtered = courseId !== "" || status !== "" || accessState !== "";
  const reset = () => {
    setCourseId("");
    setStatus("");
    setAccessState("");
    setPage(1);
  };
  const change = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Enrolments"
        description="Who is learning what, and whether their access is open or still locked behind the referral goal."
        actions={canExport && <ExportButton kind="enrolments" />}
      />

      {canCourses && courses.data && (
        <Panel
          title="By course"
          description="Active, completed, withdrawn and still-locked learners. Select a course to filter the list below."
          className="mb-6"
        >
          <DataTable
            caption="Learner counts per course"
            rows={courses.data.items}
            rowKey={(c) => c.id}
            columns={[
              {
                key: "t",
                header: "Course",
                cell: (c) => (
                  <button
                    type="button"
                    className="text-left font-medium text-primary hover:underline"
                    onClick={() => change(setCourseId)(c.id)}
                    aria-pressed={courseId === c.id}
                  >
                    {c.title}
                  </button>
                ),
              },
              { key: "s", header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
              { key: "a", header: "Active", cell: (c) => c.learners.active },
              { key: "c", header: "Completed", cell: (c) => c.learners.completed },
              { key: "w", header: "Withdrawn", cell: (c) => c.learners.withdrawn },
              { key: "l", header: "Locked", cell: (c) => c.learners.locked },
            ]}
          />
        </Panel>
      )}

      <FilterBar onReset={reset} active={filtered}>
        <SelectFilter
          label="Course"
          value={courseId}
          onChange={change(setCourseId)}
          allLabel="All courses"
          options={(courses.data?.items ?? []).map((c) => ({ value: c.id, label: c.title }))}
        />
        <SelectFilter
          label="Progress"
          value={status}
          onChange={change(setStatus)}
          options={ENROLMENT_STATUSES}
        />
        <SelectFilter
          label="Access"
          value={accessState}
          onChange={change(setAccessState)}
          options={["unlocked", "locked"]}
        />
      </FilterBar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Enrolments"
            loading={query.isPending}
            rows={query.data?.items}
            rowKey={(e) => e.id}
            empty={
              <EmptyState
                title="No enrolments match"
                text={
                  filtered
                    ? "Try clearing a filter."
                    : "Enrolments appear when learners join a course."
                }
              />
            }
            columns={[
              {
                key: "u",
                header: "Learner",
                cell: (e) => (
                  <Link
                    to="/admin/users/$id"
                    params={{ id: e.user.id }}
                    className="text-primary hover:underline"
                  >
                    {personLabel(e.user)}
                  </Link>
                ),
              },
              { key: "c", header: "Course", cell: (e) => e.course },
              { key: "s", header: "Progress", cell: (e) => <StatusBadge value={e.status} /> },
              {
                key: "a",
                header: "Access",
                cell: (e) => (
                  <>
                    <StatusBadge value={e.access.state} />
                    {e.access.via && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        via {humanize(e.access.via)}
                      </span>
                    )}
                  </>
                ),
              },
              { key: "e", header: "Joined", cell: (e) => formatDate(e.enrolledAt) },
              { key: "l", header: "Last active", cell: (e) => formatDate(e.lastActivityAt) },
              { key: "d", header: "Completed", cell: (e) => formatDate(e.completedAt) },
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
