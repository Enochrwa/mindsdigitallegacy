import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlocksEditor } from "@/components/admin/BlocksEditor";
import { LessonDialog } from "@/components/admin/LessonDialog";
import { useCan } from "@/components/admin/meta";
import {
  ConfirmDialog,
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
import {
  COURSE_LEVELS,
  LANGUAGES,
  adminApi,
  buildLayout,
  cleanBlocks,
  failureMessage,
  failureProblems,
  formatDate,
  formatDuration,
  humanize,
  isSlug,
  moveLesson,
  moveLessonToSection,
  parseList,
  slugify,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type {
  Block,
  Category,
  Course,
  CourseRow,
  CourseView,
  Lesson,
  Page,
  Section,
  UnlockPolicy,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/courses/$id")({ component: CourseEditorPage });

function CourseEditorPage() {
  const { id } = Route.useParams();
  const query = useAdminQuery<CourseView>(`/courses/${id}`);
  if (query.isPending) return <PageSkeleton />;
  if (query.isError) {
    return (
      <>
        <BackLink />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  return <Editor view={query.data} />;
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="mb-3">
      <Link to="/admin/courses">
        <ArrowLeft aria-hidden /> All courses
      </Link>
    </Button>
  );
}

function Editor({ view }: { view: CourseView }) {
  const canWrite = useCan("courses:write");
  const { course } = view;
  const { run, busy } = useAdminAction();
  const [problems, setProblems] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<"published" | "draft" | "archived" | null>(null);

  const setStatus = async (status: Course["status"]) => {
    setProblems([]);
    const result = await run(
      () => adminApi.post<CourseView>(`/courses/${course.id}/status`, { status }),
      {
        success:
          status === "published"
            ? "Course published."
            : status === "archived"
              ? "Course archived."
              : "Course moved back to draft.",
        refresh: ["/courses"],
      },
    );
    if (!result.ok) setProblems(failureProblems(result));
  };

  return (
    <>
      <BackLink />
      <PageHeader
        title={course.title}
        description={`/${course.slug} · ${view.category ?? "No category"} · ${view.learners.active + view.learners.completed} learners · version ${course.contentVersion}`}
        actions={
          <>
            <StatusBadge value={course.status} />
            {canWrite && course.status !== "published" && (
              <Button size="sm" onClick={() => setConfirm("published")} disabled={busy}>
                Publish
              </Button>
            )}
            {canWrite && course.status === "published" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm("draft")}
                disabled={busy}
              >
                Unpublish
              </Button>
            )}
            {canWrite && course.status !== "archived" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm("archived")}
                disabled={busy}
              >
                Archive
              </Button>
            )}
          </>
        }
      />
      {course.source === "file" && (
        <div className="mb-4">
          <Notice kind="info">
            This course came from the content file. The first change you save here makes the console
            its owner, and the file import will leave it alone from then on.
          </Notice>
        </div>
      )}
      {problems.length > 0 && (
        <div className="mb-4">
          <Notice kind="error">
            <p className="font-medium">This course cannot be published yet:</p>
            <ul className="mt-1 list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <Tabs defaultValue="curriculum">
        <TabsList>
          <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
          <TabsTrigger value="details">Details and access</TabsTrigger>
        </TabsList>
        <TabsContent value="curriculum" className="mt-4">
          <Curriculum view={view} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="details" className="mt-4">
          <DetailsForm key={course.updatedAt} course={course} canWrite={canWrite} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        busy={busy}
        title={
          confirm === "published"
            ? "Publish this course?"
            : confirm === "archived"
              ? "Archive this course?"
              : "Unpublish this course?"
        }
        description={
          confirm === "published"
            ? "Learners will see it on the academy page. It needs at least one published, required lesson."
            : confirm === "archived"
              ? "It disappears from the academy. Existing learners keep their progress."
              : "It disappears from the academy until you publish it again. Existing learners keep their progress."
        }
        confirmLabel={
          confirm === "published" ? "Publish" : confirm === "archived" ? "Archive" : "Unpublish"
        }
        destructive={confirm !== "published"}
        onConfirm={() => (confirm ? setStatus(confirm) : undefined)}
      />
    </>
  );
}

// ------------------------------------------------------------------ curriculum

function Curriculum({ view, canWrite }: { view: CourseView; canWrite: boolean }) {
  const { course, lessons } = view;
  const sections = [...view.sections].sort((a, b) => a.order - b.order);
  const { run, busy } = useAdminAction();
  const [lessonTarget, setLessonTarget] = useState<{
    lesson: Lesson | null;
    sectionId: string;
  } | null>(null);
  const [sectionTarget, setSectionTarget] = useState<Section | "new" | null>(null);
  const [deleting, setDeleting] = useState<Section | null>(null);
  const [notice, setNotice] = useState<string[]>([]);

  const layout = buildLayout(sections, lessons);
  const lessonsOf = (sectionId: string) =>
    lessons.filter((l) => l.sectionId === sectionId).sort((a, b) => a.order - b.order);
  const apply = (next: typeof layout, success: string) =>
    run(() => adminApi.put(`/courses/${course.id}/lesson-order`, { layout: next }), {
      success,
      refresh: ["/courses"],
    });

  const toggleLesson = async (lesson: Lesson) => {
    setNotice([]);
    const status = lesson.status === "published" ? "draft" : "published";
    const result = await run(() => adminApi.post(`/lessons/${lesson.id}/status`, { status }), {
      success: status === "published" ? "Lesson published." : "Lesson moved to draft.",
      refresh: ["/courses"],
    });
    if (!result.ok) setNotice([`${lesson.title}: `, ...failureProblems(result)]);
  };

  const published = lessons.filter((l) => l.status === "published");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {sections.length} sections · {lessons.length} lessons ({published.length} published) ·{" "}
          {formatDuration(course.stats.totalDurationSec)} of video
        </p>
        {canWrite && (
          <Button size="sm" onClick={() => setSectionTarget("new")}>
            <Plus aria-hidden /> Add section
          </Button>
        )}
      </div>
      {notice.length > 0 && (
        <Notice kind="error">
          {notice[0]}
          {notice.slice(1).join(" ")}
        </Notice>
      )}

      {sections.length === 0 && (
        <Panel>
          <EmptyState
            title="No sections yet"
            text="Add a section such as “Getting started”, then add lessons to it."
          />
        </Panel>
      )}

      {sections.map((section) => {
        const own = lessonsOf(section.id);
        return (
          <Panel
            key={section.id}
            title={section.title}
            description={section.summary}
            actions={
              canWrite && (
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLessonTarget({ lesson: null, sectionId: section.id })}
                  >
                    <Plus aria-hidden /> Lesson
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Rename section ${section.title}`}
                    onClick={() => setSectionTarget(section)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete section ${section.title}`}
                    onClick={() => setDeleting(section)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )
            }
          >
            {own.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lessons in this section.</p>
            ) : (
              <ol className="divide-y divide-border">
                {own.map((lesson, i) => (
                  <li key={lesson.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="w-6 text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{lesson.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {humanize(lesson.kind)}
                        {lesson.video ? ` · ${formatDuration(lesson.video.durationSec)}` : ""}
                        {lesson.required ? " · required" : ""}
                        {lesson.isPreview ? " · free preview" : ""}
                      </p>
                    </div>
                    <StatusBadge value={lesson.status} />
                    {canWrite && (
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Move ${lesson.title} up`}
                          disabled={i === 0 || busy}
                          onClick={() =>
                            void apply(moveLesson(layout, lesson.id, -1), "Order saved.")
                          }
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Move ${lesson.title} down`}
                          disabled={i === own.length - 1 || busy}
                          onClick={() =>
                            void apply(moveLesson(layout, lesson.id, 1), "Order saved.")
                          }
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        {sections.length > 1 && (
                          <select
                            aria-label={`Move ${lesson.title} to another section`}
                            className="rounded-md border border-input bg-background px-1 py-1 text-xs"
                            value=""
                            disabled={busy}
                            onChange={(e) => {
                              if (e.target.value !== "")
                                void apply(
                                  moveLessonToSection(layout, sections, lesson.id, e.target.value),
                                  "Lesson moved.",
                                );
                            }}
                          >
                            <option value="">Move to…</option>
                            {sections
                              .filter((s) => s.id !== section.id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.title}
                                </option>
                              ))}
                          </select>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLessonTarget({ lesson, sectionId: section.id })}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void toggleLesson(lesson)}
                        >
                          {lesson.status === "published" ? "Unpublish" : "Publish"}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        );
      })}

      {lessonTarget && (
        <LessonDialog
          key={lessonTarget.lesson?.id ?? "new"}
          courseId={course.id}
          sections={sections}
          lesson={lessonTarget.lesson}
          defaultSectionId={lessonTarget.sectionId}
          onClose={() => setLessonTarget(null)}
        />
      )}
      {sectionTarget !== null && (
        <SectionDialog
          key={sectionTarget === "new" ? "new" : sectionTarget.id}
          courseId={course.id}
          target={sectionTarget}
          onClose={() => setSectionTarget(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.title ?? ""}”?`}
        description="Only empty sections can be deleted. Move its lessons to another section first."
        confirmLabel="Delete section"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (deleting)
            await run(() => adminApi.del(`/sections/${deleting.id}`), {
              success: "Section deleted.",
              refresh: ["/courses"],
            });
        }}
      />
    </div>
  );
}

function SectionDialog({
  courseId,
  target,
  onClose,
}: {
  courseId: string;
  target: Section | "new";
  onClose: () => void;
}) {
  const existing = target === "new" ? null : target;
  const { run, busy } = useAdminAction();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { title: title.trim(), summary: summary.trim() === "" ? null : summary.trim() };
    const result = await run(
      () =>
        existing === null
          ? adminApi.post(`/courses/${courseId}/sections`, body)
          : adminApi.put(`/sections/${existing.id}`, body),
      { success: "Section saved.", refresh: ["/courses"] },
    );
    if (result.ok) onClose();
    else setError(failureMessage(result));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Rename section" : "New section"}</DialogTitle>
          <DialogDescription>Sections group lessons in the course outline.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Title">
            <input
              className={inputCls}
              value={title}
              maxLength={120}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Short description (optional)" hint={`${summary.length} of 240`}>
            <input
              className={inputCls}
              value={summary}
              maxLength={240}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || title.trim() === ""}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ details

function DetailsForm({ course, canWrite }: { course: Course; canWrite: boolean }) {
  const { run, busy } = useAdminAction();
  const categories = useAdminQuery<{ items: Category[] }>("/categories");
  const others = useAdminQuery<Page<CourseRow>>("/courses", { pageSize: 100 });
  const [title, setTitle] = useState(course.title);
  const [slug, setSlug] = useState(course.slug);
  const [categoryId, setCategoryId] = useState(course.categoryId);
  const [summary, setSummary] = useState(course.summary);
  const [audience, setAudience] = useState(course.audience);
  const [level, setLevel] = useState(course.level);
  const [language, setLanguage] = useState(course.language);
  const [order, setOrder] = useState(course.order);
  const [tags, setTags] = useState(course.tags.join(", "));
  const [outcomes, setOutcomes] = useState(course.outcomes.join("\n"));
  const [instructors, setInstructors] = useState(course.instructors);
  const [prerequisiteIds, setPrerequisiteIds] = useState(course.prerequisiteIds);
  const [policy, setPolicy] = useState<UnlockPolicy>(course.unlockPolicy);
  const [description, setDescription] = useState<Block[]>(course.description);
  const [error, setError] = useState<string | null>(null);

  const tagList = parseList(tags)
    .map(slugify)
    .filter((t) => t !== "");
  const outcomeList = outcomes
    .split("\n")
    .map((o) => o.trim())
    .filter((o) => o !== "");
  const cleanInstructors = instructors
    .map((i) => ({ name: i.name.trim(), title: i.title.trim() }))
    .filter((i) => i.name !== "" || i.title !== "");

  const issues: string[] = [];
  if (title.trim() === "") issues.push("Add a title.");
  if (!isSlug(slug)) issues.push("The web address name needs lower-case words joined by hyphens.");
  if (summary.trim() === "") issues.push("Add a one-line summary.");
  if (audience.trim() === "") issues.push("Say who the course is for.");
  if (!Number.isInteger(order) || order < 0 || order > 10_000)
    issues.push("Order must be 0 to 10000.");
  if (tagList.length > 12) issues.push("At most 12 tags.");
  if (outcomeList.length > 12) issues.push("At most 12 outcomes.");
  if (cleanInstructors.some((i) => i.name === "" || i.title === ""))
    issues.push("Each instructor needs a name and a title.");
  if (
    policy.type === "referral" &&
    (!Number.isInteger(policy.threshold) || policy.threshold < 1 || policy.threshold > 50)
  )
    issues.push("Friends needed must be 1 to 50.");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (issues.length > 0) {
      setError(issues.join(" "));
      return;
    }
    const result = await run(
      () =>
        adminApi.put<CourseView>(`/courses/${course.id}`, {
          slug,
          categoryId,
          title: title.trim(),
          summary: summary.trim(),
          description: cleanBlocks(description),
          level,
          language,
          order,
          tags: tagList,
          outcomes: outcomeList,
          audience: audience.trim(),
          prerequisiteIds,
          instructors: cleanInstructors,
          unlockPolicy: policy,
        }),
      { success: "Course saved.", refresh: ["/courses"] },
    );
    if (!result.ok) setError(failureMessage(result));
  };

  return (
    <form className="space-y-4" onSubmit={(e) => void save(e)} noValidate>
      <fieldset disabled={!canWrite || busy} className="space-y-4">
        <legend className="sr-only">Course details</legend>
        {error && <Notice kind="error">{error}</Notice>}

        <Panel title="Basics">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input
                className={inputCls}
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field
              label="Web address name"
              hint="Changing this changes the course link."
              error={!isSlug(slug) ? "Lower-case letters, digits and hyphens." : undefined}
            >
              <input
                className={`${inputCls} font-mono`}
                value={slug}
                maxLength={80}
                onChange={(e) => setSlug(e.target.value)}
              />
            </Field>
            <Field label="Category">
              <select
                className={selectCls}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {(categories.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order on the academy page" hint="Smaller numbers come first.">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={10000}
                value={Number.isFinite(order) ? order : ""}
                onChange={(e) => setOrder(e.target.valueAsNumber)}
              />
            </Field>
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
          <Field label="One-line summary" hint={`${summary.length} of 200`} className="mt-3">
            <input
              className={inputCls}
              value={summary}
              maxLength={200}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <Field label="Who it is for" className="mt-3">
            <input
              className={inputCls}
              value={audience}
              maxLength={200}
              onChange={(e) => setAudience(e.target.value)}
            />
          </Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Tags" hint="Separated by commas. Lower-case words.">
              <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="What learners will be able to do" hint="One outcome per line, up to 12.">
              <textarea
                className={`${inputCls} min-h-24`}
                value={outcomes}
                onChange={(e) => setOutcomes(e.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Access" description="How learners unlock this course.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Unlock rule">
              <select
                className={selectCls}
                value={policy.type}
                onChange={(e) => {
                  const type = e.target.value as UnlockPolicy["type"];
                  setPolicy(
                    type === "referral"
                      ? { type, threshold: policy.type === "referral" ? policy.threshold : 3 }
                      : { type },
                  );
                }}
              >
                <option value="open">Open to everyone</option>
                <option value="referral">Free after inviting friends</option>
                <option value="code">Only with an unlock code</option>
              </select>
            </Field>
            {policy.type === "referral" && (
              <Field
                label="Friends needed"
                hint="With an A/B test on in Settings, each referrer's assigned number applies instead."
              >
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  max={50}
                  value={Number.isFinite(policy.threshold) ? policy.threshold : ""}
                  onChange={(e) =>
                    setPolicy({ type: "referral", threshold: e.target.valueAsNumber })
                  }
                />
              </Field>
            )}
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Finish first (prerequisites)</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {(others.data?.items ?? [])
                .filter((c) => c.id !== course.id)
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={prerequisiteIds.includes(c.id)}
                      disabled={!prerequisiteIds.includes(c.id) && prerequisiteIds.length >= 10}
                      onChange={(e) =>
                        setPrerequisiteIds(
                          e.target.checked
                            ? [...prerequisiteIds, c.id]
                            : prerequisiteIds.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {c.title}
                  </label>
                ))}
            </div>
          </fieldset>
        </Panel>

        <Panel title="Instructors">
          <div className="space-y-2">
            {instructors.map((ins, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  aria-label={`Instructor ${i + 1} name`}
                  className={inputCls}
                  placeholder="Name"
                  maxLength={80}
                  value={ins.name}
                  onChange={(e) =>
                    setInstructors(
                      instructors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <input
                  aria-label={`Instructor ${i + 1} title`}
                  className={inputCls}
                  placeholder="Title, for example Lead engineer"
                  maxLength={80}
                  value={ins.title}
                  onChange={(e) =>
                    setInstructors(
                      instructors.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove instructor ${i + 1}`}
                  onClick={() => setInstructors(instructors.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            {instructors.length < 6 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setInstructors([...instructors, { name: "", title: "" }])}
              >
                <Plus aria-hidden /> Add instructor
              </Button>
            )}
          </div>
        </Panel>

        <Panel title="About this course" description="The longer description on the course page.">
          <BlocksEditor label="Description" blocks={description} onChange={setDescription} />
        </Panel>
      </fieldset>

      {canWrite && (
        <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Last saved {formatDate(course.updatedAt, true)}.
          </p>
        </div>
      )}
    </form>
  );
}
