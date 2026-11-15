import { useId } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOCK_TYPES, emptyBlock, humanize, moveItem } from "@/lib/admin";
import type { Block, BlockType } from "@/lib/admin";
import { inputCls, selectCls } from "./ui";

const TYPE_LABEL: Record<BlockType, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  list: "List",
  note: "Callout",
  code: "Code",
};
const LIMIT: Record<BlockType, number> = {
  heading: 200,
  paragraph: 4000,
  list: 400,
  note: 1000,
  code: 4000,
};

/**
 * Structured text editor for lesson and course bodies. Content is stored as typed blocks (never HTML),
 * which is what the learner pages render, so nothing typed here can inject markup.
 * Every control is a labelled native input; reordering uses buttons so it works by keyboard.
 */
export function BlocksEditor({
  label,
  blocks,
  onChange,
}: {
  label: string;
  blocks: Block[];
  onChange: (next: Block[]) => void;
}) {
  const id = useId();
  const update = (i: number, block: Block) => onChange(blocks.map((b, j) => (j === i ? block : b)));

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      {blocks.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          No text yet. Add a block below.
        </p>
      )}
      <ol className="space-y-3">
        {blocks.map((block, i) => {
          const base = `${id}-${i}`;
          return (
            <li key={i} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {i + 1}. {TYPE_LABEL[block.type]}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Move block ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => onChange(moveItem(blocks, i, -1))}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Move block ${i + 1} down`}
                    disabled={i === blocks.length - 1}
                    onClick={() => onChange(moveItem(blocks, i, 1))}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove block ${i + 1}`}
                    onClick={() => onChange(blocks.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>

              {block.type === "heading" && (
                <input
                  aria-label={`Block ${i + 1} heading text`}
                  className={inputCls}
                  maxLength={LIMIT.heading}
                  value={block.text}
                  onChange={(e) => update(i, { ...block, text: e.target.value })}
                />
              )}
              {block.type === "paragraph" && (
                <textarea
                  aria-label={`Block ${i + 1} paragraph text`}
                  className={`${inputCls} min-h-24`}
                  maxLength={LIMIT.paragraph}
                  value={block.text}
                  onChange={(e) => update(i, { ...block, text: e.target.value })}
                />
              )}
              {block.type === "list" && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={block.ordered === true}
                      onChange={(e) => update(i, { ...block, ordered: e.target.checked })}
                    />
                    Numbered list
                  </label>
                  <textarea
                    id={`${base}-items`}
                    aria-label={`Block ${i + 1} list items, one per line`}
                    className={`${inputCls} min-h-24`}
                    value={block.items.join("\n")}
                    onChange={(e) => update(i, { ...block, items: e.target.value.split("\n") })}
                  />
                  <p className="text-xs text-muted-foreground">One item per line, up to 40.</p>
                </div>
              )}
              {block.type === "note" && (
                <div className="space-y-2">
                  <select
                    aria-label={`Block ${i + 1} callout style`}
                    className={selectCls}
                    value={block.tone ?? "tip"}
                    onChange={(e) => update(i, { ...block, tone: e.target.value as "tip" })}
                  >
                    <option value="tip">Tip</option>
                    <option value="info">Information</option>
                    <option value="warning">Warning</option>
                  </select>
                  <textarea
                    aria-label={`Block ${i + 1} callout text`}
                    className={`${inputCls} min-h-16`}
                    maxLength={LIMIT.note}
                    value={block.text}
                    onChange={(e) => update(i, { ...block, text: e.target.value })}
                  />
                </div>
              )}
              {block.type === "code" && (
                <div className="space-y-2">
                  <input
                    aria-label={`Block ${i + 1} code language`}
                    className={inputCls}
                    placeholder="Language, for example js or sql"
                    maxLength={20}
                    value={block.language ?? ""}
                    onChange={(e) => update(i, { ...block, language: e.target.value })}
                  />
                  <textarea
                    aria-label={`Block ${i + 1} code`}
                    className={`${inputCls} min-h-24 font-mono`}
                    maxLength={LIMIT.code}
                    spellCheck={false}
                    value={block.text}
                    onChange={(e) => update(i, { ...block, text: e.target.value })}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        {BLOCK_TYPES.map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...blocks, emptyBlock(type)])}
          >
            <Plus aria-hidden /> {humanize(TYPE_LABEL[type])}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
