import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  SearchInput,
  SelectFilter,
  Stat,
  StatusBadge,
  Toggle,
  inputCls,
  selectCls,
} from "@/components/admin/ui";
import {
  COURSE_LEVELS,
  COURSE_STATUSES,
  LANGUAGES,
  adminApi,
  failureMessage,
  formatDuration,
  humanize,
  isSlug,
  slugify,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type { Category, CourseRow, CourseView, Page } from "@/lib/admin";

export const Route = createFileRoute("/admin/courses/")({ component: CoursesPage });

type CourseList = Page<CourseRow> & { counts: Record<string, number> };
const PAGE_SIZE = 25;

function CoursesPage() {
  const canWrite = useCan("courses:write");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = useAdminQuery<CourseList>("/courses", {
    q,
    status,
    categoryId,
    page,
    pageSize: PAGE_SIZE,
  });
  const categories = useAdminQuery<{ items: Category[] }>("/categories");
  const filtered = q !== "" || status !== "" || categoryId !== "";
  const counts = query.data?.counts;

  return (
    <>
      <PageHeader
        title="Courses"
        description="Create and manage the academy. Courses edited here are managed in the console and are no longer overwritten by the content file import."
        actions={
          canWrite && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden /> New course
            </Button>
          )
        }
      />
      <Tabs defaultValue="courses">
        <TabsList>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {COURSE_STATUSES.map((s) => (
              <Stat key={s} label={humanize(s)} value={counts?.[s] ?? "-"} />
            ))}
          </div>
          <FilterBar
            active={filtered}
            onReset={() => {
              setQ("");
              setStatus("");
              setCategoryId("");
              setPage(1);
            }}
          >
            <SearchInput
              value={q}
              label="Search courses"
              onSearch={(v) => {
                setQ(v);
                setPage(1);
              }}
            />
            <SelectFilter
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={COURSE_STATUSES}
            />
            <SelectFilter
              label="Category"
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v);
                setPage(1);
              }}
              allLabel="All categories"
              options={(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </FilterBar>

          {query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <>
              <DataTable
                caption="Courses"
                loading={query.isPending}
                rows={query.data?.items}
                rowKey={(c) => c.id}
                empty={
                  <EmptyState
                    title="No courses found"
                    text={filtered ? "Try clearing a filter." : "Create the first course."}
                  />
                }
                columns={[
                  {
                    key: "t",
                    header: "Course",
                    cell: (c) => (
                      <>
                        <Link
                          to="/admin/courses/$id"
                          params={{ id: c.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.title}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {c.slug}
                        </span>
                      </>
                    ),
                  },
                  { key: "c", header: "Category", cell: (c) => c.categoryName ?? "-" },
                  { key: "s", header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
                  {
                    key: "u",
                    header: "Unlock",
                    cell: (c) =>
                      c.unlockPolicy.type === "referral"
                        ? `${c.unlockPolicy.threshold} friends`
                        : humanize(c.unlockPolicy.type),
                  },
                  {
                    key: "l",
                    header: "Lessons",
                    cell: (c) => (
                      <>
                        {c.stats.lessonCount}
                        <span className="block text-xs text-muted-foreground">
                          {formatDuration(c.stats.totalDurationSec)}
                        </span>
                      </>
                    ),
                  },
                  {
                    key: "n",
                    header: "Learners",
                    cell: (c) => (
                      <>
                        {c.learners.active + c.learners.completed}
                        <span className="block text-xs text-muted-foreground">
                          {c.learners.completed} completed
                          {c.learners.locked > 0 ? `, ${c.learners.locked} locked` : ""}
                        </span>
                      </>
                    ),
                  },
                  {
                    key: "o",
                    header: "Managed",
                    cell: (c) => (c.source === "admin" ? "Console" : "Content file"),
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
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoriesPanel canWrite={canWrite} />
        </TabsContent>
      </Tabs>

      {creating && (
        <NewCourseDialog
          categories={categories.data?.items ?? []}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ new course

function NewCourseDialog({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const navigate = useNavigate();
  const { run, busy } = useAdminAction();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [summary, setSummary] = useState("");
  const [audience, setAudience] = useState("");
  const [level, setLevel] = useState<(typeof COURSE_LEVELS)[0 | 1 | 2]>("beginner");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[0 | 1 | 2]>("en");
  const [gated, setGated] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const valid =
    title.trim().length > 0 &&
    isSlug(slug) &&
    categoryId !== "" &&
    summary.trim().length > 0 &&
    audience.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = await run(
      () =>
        adminApi.post<CourseView>("/courses", {
          slug,
          categoryId,
          title: title.trim(),
          summary: summary.trim(),
          description: [],
          level,
          language,
          order: 100,
          tags: [],
          outcomes: [],
          audience: audience.trim(),
          prerequisiteIds: [],
          instructors: [],
          unlockPolicy: gated ? { type: "referral", threshold: 3 } : { type: "open" },
        }),
      { success: "Course created as a draft.", refresh: ["/courses"] },
    );
    if (!result.ok) {
      setError(failureMessage(result));
      return;
    }
    onClose();
    await navigate({ to: "/admin/courses/$id", params: { id: result.data.course.id } });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
          <DialogDescription>
            Start with the basics. It begins as a draft; add sections and lessons next, then
            publish.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Title">
            <input
              className={inputCls}
              value={title}
              maxLength={100}
              required
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field
            label="Web address name"
            hint="Lower-case words joined by hyphens. It becomes part of the course link."
            error={
              slug !== "" && !isSlug(slug)
                ? "Use lower-case letters, digits and hyphens."
                : undefined
            }
          >
            <input
              className={`${inputCls} font-mono`}
              value={slug}
              maxLength={80}
              required
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
            />
          </Field>
          <Field label="Category">
            <select
              className={selectCls}
              value={categoryId}
              required
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="One-line summary" hint={`${summary.length} of 200`}>
            <input
              className={inputCls}
              value={summary}
              maxLength={200}
              required
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <Field label="Who it is for">
            <input
              className={inputCls}
              value={audience}
              maxLength={200}
              required
              onChange={(e) => setAudience(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Level">
              <select
                className={selectCls}
                value={level}
                onChange={(e) => setLevel(e.target.value as typeof level)}
              >
                {COURSE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {humanize(l)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Language">
              <select
                className={selectCls}
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Toggle
            label="Free after inviting friends"
            hint="Learners unlock it by bringing friends (3 by default; change it in the course). Off means open to everyone."
            checked={gated}
            onChange={setGated}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || busy}>
              {busy ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ categories

function CategoriesPanel({ canWrite }: { canWrite: boolean }) {
  const query = useAdminQuery<{ items: Category[] }>("/categories");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <>
      <div className="mb-3 flex justify-end">
        {canWrite && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden /> New category
          </Button>
        )}
      </div>
      <DataTable
        caption="Course categories"
        loading={query.isPending}
        rows={query.data?.items}
        rowKey={(c) => c.id}
        empty={<EmptyState title="No categories yet" />}
        columns={[
          {
            key: "n",
            header: "Category",
            cell: (c) => (
              <>
                <span className="font-medium">{c.name}</span>
                <span className="block font-mono text-xs text-muted-foreground">{c.slug}</span>
              </>
            ),
          },
          { key: "d", header: "Description", cell: (c) => c.description },
          { key: "o", header: "Order", cell: (c) => c.order },
          {
            key: "v",
            header: "Shown",
            cell: (c) => <StatusBadge value={c.visible ? "active" : "disabled"} />,
          },
          {
            key: "a",
            header: "",
            cell: (c) =>
              canWrite && (
                <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                  Edit
                </Button>
              ),
          },
        ]}
      />
      {editing !== null && (
        <CategoryDialog
          key={editing === "new" ? "new" : editing.id}
          target={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CategoryDialog({ target, onClose }: { target: Category | "new"; onClose: () => void }) {
  const existing = target === "new" ? null : target;
  const { run, busy } = useAdminAction();
  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(existing !== null);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [order, setOrder] = useState(existing?.order ?? 10);
  const [visible, setVisible] = useState(existing?.visible ?? true);
  const [error, setError] = useState<string | null>(null);
  const valid =
    name.trim() !== "" && isSlug(slug) && description.trim() !== "" && order >= 0 && order <= 1000;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = { slug, name: name.trim(), description: description.trim(), order, visible };
    const result = await run(
      () =>
        existing === null
          ? adminApi.post("/categories", body)
          : adminApi.put(`/categories/${existing.id}`, body),
      { success: "Category saved.", refresh: ["/categories", "/courses"] },
    );
    if (result.ok) onClose();
    else setError(failureMessage(result));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>Categories group courses on the academy page.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Name">
            <input
              className={inputCls}
              value={name}
              maxLength={80}
              required
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field
            label="Web address name"
            error={
              slug !== "" && !isSlug(slug)
                ? "Use lower-case letters, digits and hyphens."
                : undefined
            }
          >
            <input
              className={`${inputCls} font-mono`}
              value={slug}
              maxLength={80}
              required
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
            />
          </Field>
          <Field label="Description" hint={`${description.length} of 240`}>
            <input
              className={inputCls}
              value={description}
              maxLength={240}
              required
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Order" hint="Smaller numbers come first.">
            <input
              className={inputCls}
              type="number"
              min={0}
              max={1000}
              value={Number.isFinite(order) ? order : ""}
              onChange={(e) => setOrder(e.target.valueAsNumber)}
            />
          </Field>
          <Toggle label="Shown on the academy page" checked={visible} onChange={setVisible} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || busy}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
