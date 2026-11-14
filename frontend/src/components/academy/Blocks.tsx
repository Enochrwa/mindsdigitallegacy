import type { ContentBlock } from "@/lib/academy";

const TONE = {
  tip: "border-accent/60 bg-accent/10",
  warning: "border-destructive/60 bg-destructive/10",
  info: "border-primary/30 bg-primary/5",
} as const;

/** Renders structured content. Text is always rendered as text (React escapes it); there is no HTML injection path. */
export function Blocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-4 leading-7 text-foreground/90">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <h3 key={i} className="pt-2 text-xl font-bold text-primary">
                {b.text}
              </h3>
            );
          case "paragraph":
            return <p key={i}>{b.text}</p>;
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={i} className={`${b.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-6`}>
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </Tag>
            );
          }
          case "note":
            return (
              <aside
                key={i}
                className={`rounded-lg border-l-4 p-4 text-sm ${TONE[b.tone ?? "info"]}`}
              >
                {b.text}
              </aside>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
                <code>{b.text}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
