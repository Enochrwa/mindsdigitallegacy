import { useId, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { failureMessage, failureProblems, humanize } from "@/lib/admin";
import type { AdminError } from "@/lib/admin";

export const inputCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/30 disabled:opacity-60";
export const selectCls = `${inputCls} pr-8`;

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-4 shadow-sm md:p-5", className)}
    >
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "warn" | undefined;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        tone === "warn" ? "border-destructive/40" : "border-border",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Tone = "good" | "warn" | "bad" | "info" | "muted";
const TONES: Record<Tone, string> = {
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  bad: "bg-destructive/15 text-destructive",
  info: "bg-primary/10 text-primary",
  muted: "bg-muted text-muted-foreground",
};
const STATUS_TONE: Record<string, Tone> = {
  active: "good",
  published: "good",
  qualified: "good",
  converted: "good",
  completed: "good",
  success: "good",
  unlocked: "good",
  verified: "good",
  pending: "info",
  new: "info",
  contacted: "info",
  draft: "muted",
  closed: "muted",
  archived: "muted",
  withdrawn: "muted",
  disabled: "muted",
  unverified: "warn",
  needs_review: "warn",
  locked: "warn",
  high: "bad",
  low: "muted",
  normal: "info",
  suspended: "bad",
  deleted: "bad",
  rejected: "bad",
  revoked: "bad",
  spam: "bad",
  failure: "bad",
};

export function StatusBadge({ value, tone }: { value: string; tone?: Tone | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone ?? STATUS_TONE[value] ?? "muted"],
      )}
    >
      {humanize(value)}
    </span>
  );
}

export function EmptyState({ title, text }: { title: string; text?: string | undefined }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: AdminError | Error;
  onRetry?: () => void;
}) {
  const failure = "failure" in error ? error.failure : undefined;
  const lines = failure ? failureProblems(failure) : [];
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-destructive">
        <AlertCircle className="h-4 w-4" aria-hidden />
        {failure ? failureMessage(failure) : "Something went wrong."}
      </p>
      {lines.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-foreground">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: ReactNode;
}) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  const tone =
    kind === "error"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : kind === "success"
        ? "border-emerald-500/40 bg-emerald-500/10 text-foreground"
        : "border-border bg-muted text-foreground";
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-md border p-3 text-sm ${tone}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden />;
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Labelled control. The label wraps the control so it is announced and clickable. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block text-sm font-medium", className)}>
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="mt-1 h-4 w-4 accent-[var(--primary)]"
        checked={checked}
        disabled={disabled ?? false}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </label>
    </div>
  );
}

// ------------------------------------------------------------ filters and paging

export function SearchInput({
  value,
  onSearch,
  label = "Search",
  placeholder,
}: {
  value: string;
  onSearch: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      role="search"
      className="min-w-[14rem] flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(draft.trim());
      }}
    >
      <label className="block text-xs font-medium text-muted-foreground">
        {label}
        <span className="relative mt-1 block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={draft}
            maxLength={100}
            placeholder={placeholder ?? "Press Enter to search"}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft.trim() !== value && onSearch(draft.trim())}
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/30"
          />
        </span>
      </label>
    </form>
  );
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (string | { value: string; label: string })[];
  allLabel?: string;
}) {
  return (
    <label className="block min-w-[8rem] text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-ring/30"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? humanize(o) : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-ring/30"
      />
    </label>
  );
}

export function FilterBar({
  children,
  onReset,
  active,
}: {
  children: ReactNode;
  onReset?: () => void;
  active?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
      {children}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} disabled={active === false}>
          Reset filters
        </Button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0 ? "No results" : `Showing ${from}-${to} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden /> Previous
        </Button>
        <span className="tabular-nums text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

// ------------------------------------------------------------ tables

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading,
  empty,
}: {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table aria-busy={loading ?? false}>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} scope="col" className={c.className}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && rows === undefined
            ? Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : (rows ?? []).map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {!loading && rows !== undefined && rows.length === 0 && (
        <div>{empty ?? <EmptyState title="Nothing here yet" />}</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ confirmation

/**
 * Controlled confirmation. With `reasonLabel` the person must type a short reason (min 3 characters),
 * which is passed to onConfirm. Focus returns to the page when it closes.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  reasonLabel,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reasonLabel?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const needsReason = reasonLabel !== undefined;
  const invalid = needsReason && reason.trim().length < 3;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {needsReason && (
          <Field label={reasonLabel}>
            <input
              className={inputCls}
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </Field>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={invalid || (busy ?? false)}
            onClick={async () => {
              await onConfirm(reason.trim());
              setReason("");
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
