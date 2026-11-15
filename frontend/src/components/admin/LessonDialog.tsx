import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LANGUAGES,
  LESSON_KINDS,
  adminApi,
  cleanBlocks,
  extractYouTubeId,
  failureMessage,
  failureProblems,
  humanize,
  isSlug,
  parseDuration,
  slugify,
  useAdminAction,
} from "@/lib/admin";
import type { Block, Lesson, Section } from "@/lib/admin";
import { thumbnailUrl } from "@/lib/youtube";
import { BlocksEditor } from "./BlocksEditor";
import { Field, Notice, Toggle, inputCls, selectCls } from "./ui";

type Resource = Lesson["resources"][number];

const secondsToText = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** Create or edit one lesson: text, YouTube video id and length, transcript and resources. */
export function LessonDialog({
  courseId,
  sections,
  lesson,
  defaultSectionId,
  onClose,
}: {
  courseId: string;
  sections: Section[];
  lesson: Lesson | null;
  defaultSectionId: string;
  onClose: () => void;
}) {
  const { run, busy } = useAdminAction();
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [slug, setSlug] = useState(lesson?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(lesson !== null);
  const [summary, setSummary] = useState(lesson?.summary ?? "");
  const [sectionId, setSectionId] = useState(lesson?.sectionId ?? defaultSectionId);
  const [kind, setKind] = useState<Lesson["kind"]>(lesson?.kind ?? "video");
  const [required, setRequired] = useState(lesson?.required ?? true);
  const [isPreview, setIsPreview] = useState(lesson?.isPreview ?? false);
  const [videoInput, setVideoInput] = useState(lesson?.video?.videoId ?? "");
  const [durationInput, setDurationInput] = useState(
    lesson?.video ? secondsToText(lesson.video.durationSec) : "",
  );
  const [body, setBody] = useState<Block[]>(lesson?.body ?? []);
  const [transcriptLang, setTranscriptLang] = useState<(typeof LANGUAGES)[number]>(
    lesson?.transcript?.language ?? "en",
  );
  const [transcript, setTranscript] = useState(lesson?.transcript?.paragraphs.join("\n\n") ?? "");
  const [resources, setResources] = useState<Resource[]>(lesson?.resources ?? []);
  const [error, setError] = useState<string | null>(null);

  const videoId = extractYouTubeId(videoInput);
  const duration = parseDuration(durationInput);
  const thumb = videoId ? thumbnailUrl(videoId) : null;
  const paragraphs = transcript
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const badResource = resources.some(
    (r) => r.title.trim() === "" || !/^https:\/\/\S+$/.test(r.url.trim()),
  );

  const problems: string[] = [];
  if (title.trim() === "") problems.push("Add a title.");
  if (!isSlug(slug))
    problems.push("The web address name needs lower-case words joined by hyphens.");
  if (summary.trim() === "") problems.push("Add a short summary.");
  if (sectionId === "") problems.push("Choose a section.");
  if (kind === "video" && videoInput.trim() !== "" && videoId === null)
    problems.push("The video must be a YouTube link or its 11-character id.");
  if (kind === "video" && videoId !== null && duration === null)
    problems.push("Enter the video length, for example 12:30.");
  if (badResource) problems.push("Every resource needs a title and an https link.");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (problems.length > 0) {
      setError(problems.join(" "));
      return;
    }
    const video =
      kind === "video" && videoId !== null && duration !== null
        ? { provider: "youtube" as const, videoId, durationSec: duration }
        : undefined;
    const fields = {
      sectionId,
      slug,
      title: title.trim(),
      summary: summary.trim(),
      kind,
      required,
      isPreview,
      body: cleanBlocks(body),
      resources: resources.map((r) => ({ ...r, title: r.title.trim(), url: r.url.trim() })),
    };
    const result = await run(
      () =>
        lesson === null
          ? adminApi.post<{ lesson: Lesson }>(`/courses/${courseId}/lessons`, {
              ...fields,
              ...(video ? { video } : {}),
              ...(paragraphs.length > 0
                ? { transcript: { language: transcriptLang, paragraphs } }
                : {}),
            })
          : adminApi.put<{ lesson: Lesson }>(`/lessons/${lesson.id}`, {
              ...fields,
              video: video ?? null,
              transcript: paragraphs.length > 0 ? { language: transcriptLang, paragraphs } : null,
            }),
      {
        success: lesson === null ? "Lesson added as a draft." : "Lesson saved.",
        refresh: ["/courses"],
      },
    );
    if (result.ok) onClose();
    else setError([failureMessage(result), ...failureProblems(result)].join(" "));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lesson ? "Edit lesson" : "New lesson"}</DialogTitle>
          <DialogDescription>
            Lessons start as drafts. Publish a lesson from the curriculum list once it is ready.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input
                className={inputCls}
                value={title}
                maxLength={120}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugEdited) setSlug(slugify(e.target.value));
                }}
              />
            </Field>
            <Field
              label="Web address name"
              error={
                slug !== "" && !isSlug(slug) ? "Lower-case letters, digits and hyphens." : undefined
              }
            >
              <input
                className={`${inputCls} font-mono`}
                value={slug}
                maxLength={80}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugEdited(true);
                }}
              />
            </Field>
          </div>
          <Field label="Summary" hint={`${summary.length} of 240`}>
            <input
              className={inputCls}
              value={summary}
              maxLength={240}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Section">
              <select
                className={selectCls}
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select
                className={selectCls}
                value={kind}
                onChange={(e) => setKind(e.target.value as Lesson["kind"])}
              >
                {LESSON_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k === "video" ? "Video (YouTube)" : "Reading"}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {kind === "video" && (
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_10rem_auto]">
              <Field
                label="YouTube link or video id"
                hint="Paste the link from YouTube. Use an unlisted or public video you control."
                error={
                  videoInput.trim() !== "" && videoId === null
                    ? "That is not a YouTube video."
                    : undefined
                }
              >
                <input
                  className={`${inputCls} font-mono`}
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                />
              </Field>
              <Field
                label="Length"
                hint="Minutes and seconds, like 12:30"
                error={
                  durationInput.trim() !== "" && duration === null
                    ? "Use mm:ss, up to 4 hours."
                    : undefined
                }
              >
                <input
                  className={inputCls}
                  value={durationInput}
                  inputMode="numeric"
                  onChange={(e) => setDurationInput(e.target.value)}
                />
              </Field>
              {thumb && (
                <img
                  src={thumb}
                  alt="Thumbnail of the chosen video"
                  width={160}
                  height={90}
                  className="h-[90px] w-[160px] rounded-md border border-border object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-6">
            <Toggle label="Required for completion" checked={required} onChange={setRequired} />
            <Toggle
              label="Free preview"
              hint="Visible to people who have not unlocked the course."
              checked={isPreview}
              onChange={setIsPreview}
            />
          </div>

          <BlocksEditor
            label={
              kind === "reading" ? "Lesson text (required to publish)" : "Notes under the video"
            }
            blocks={body}
            onChange={setBody}
          />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Transcript (optional)</legend>
            <select
              aria-label="Transcript language"
              className={`${selectCls} max-w-[10rem]`}
              value={transcriptLang}
              onChange={(e) => setTranscriptLang(e.target.value as typeof transcriptLang)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
            <textarea
              aria-label="Transcript text"
              className={`${inputCls} min-h-24`}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Separate paragraphs with a blank line.</p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Resources</legend>
            {resources.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_8rem_auto]">
                <input
                  aria-label={`Resource ${i + 1} title`}
                  className={inputCls}
                  placeholder="Title"
                  maxLength={120}
                  value={r.title}
                  onChange={(e) =>
                    setResources(
                      resources.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
                <input
                  aria-label={`Resource ${i + 1} link`}
                  className={inputCls}
                  placeholder="https://…"
                  inputMode="url"
                  maxLength={500}
                  value={r.url}
                  onChange={(e) =>
                    setResources(
                      resources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                    )
                  }
                />
                <select
                  aria-label={`Resource ${i + 1} type`}
                  className={selectCls}
                  value={r.kind}
                  onChange={(e) =>
                    setResources(
                      resources.map((x, j) =>
                        j === i ? { ...x, kind: e.target.value as Resource["kind"] } : x,
                      ),
                    )
                  }
                >
                  <option value="link">Link</option>
                  <option value="download">{humanize("download")}</option>
                </select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove resource ${i + 1}`}
                  onClick={() => setResources(resources.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            {resources.length < 20 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setResources([...resources, { title: "", url: "", kind: "link" }])}
              >
                <Plus aria-hidden /> Add resource
              </Button>
            )}
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save lesson"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
