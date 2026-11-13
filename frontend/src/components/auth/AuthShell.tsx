import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { PageHero } from "@/components/site/Layout";

/** Page frame for every account screen: hero plus one centred card. */
export function AuthShell({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} text={text ?? ""} />
      <section className="container-mdl py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-card md:p-8">
          {children}
        </div>
      </section>
    </>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export function Notice({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const Icon = kind === "error" ? AlertCircle : CheckCircle2;
  const tone =
    kind === "error"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : "border-accent/40 bg-accent/10 text-foreground";
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-md border p-3 text-sm ${tone}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
