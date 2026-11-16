import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Pattern } from "@/components/brand/Pattern";
import { Mark } from "@/components/brand/Mark";

/**
 * Frame for every account screen. The left side is a living imigongo pattern that reacts to the
 * pointer and "assembles" as the form is completed (`progress` from 0 to 1), so finishing the
 * form is visible rather than a bare percentage. On phones it collapses to a slim pattern band.
 */
export function AuthShell({
  eyebrow,
  title,
  text,
  children,
  progress = 0.1,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  children: ReactNode;
  progress?: number;
}) {
  return (
    <div className="grid min-h-[calc(100dvh-4rem)] lg:grid-cols-[5fr_6fr]">
      <aside className="relative h-20 overflow-hidden bg-primary lg:h-auto" aria-hidden="false">
        <Pattern interactive progress={progress} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-primary via-primary/90 to-transparent p-10 pt-28 text-primary-foreground lg:block">
          <Mark size={40} />
          <p className="mt-5 max-w-xs font-display text-2xl font-semibold leading-tight">
            Skills that stay with you.
          </p>
          <p className="mt-3 max-w-sm text-sm text-primary-foreground/75">
            Free digital skills training for Rwanda, unlocked when the friends you invite join you.
          </p>
          <p className="mt-6 text-xs text-primary-foreground/60">
            The pattern fills in as you complete the form. Move your pointer over it.
          </p>
        </div>
      </aside>
      <section className="flex items-start justify-center px-5 py-10 sm:px-8 lg:items-center lg:py-14">
        <div className="animate-rise w-full max-w-md">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-3 text-3xl md:text-4xl">{title}</h1>
          {text && <p className="mt-3 text-muted-foreground">{text}</p>}
          <div className="mt-8">{children}</div>
          <p className="mt-10 text-xs text-muted-foreground">
            <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
              Privacy notice
            </Link>
            . Your data is handled under Rwanda&apos;s data protection law.
          </p>
        </div>
      </section>
    </div>
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
    <label className="block text-sm font-semibold">
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
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : "border-accent/60 bg-accent/15 text-foreground";
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border p-3.5 text-sm ${tone}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
