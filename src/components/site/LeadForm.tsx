import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Field = { name: string; label: string; type?: "text" | "email" | "tel" | "textarea" | "select"; options?: readonly string[]; required?: boolean; full?: boolean };

function buildSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s = z.string().trim().max(f.type === "textarea" ? 2000 : 200, "Too long");
    if (f.type === "email") s = s.email("Enter a valid email");
    if (f.type === "tel") s = s.regex(/^[+\d\s()-]{7,20}$/, "Enter a valid phone number");
    shape[f.name] = f.required ? s.min(1, `${f.label} is required`) : s.or(z.literal(""));
  }
  return z.object(shape);
}

export function LeadForm({ title, fields, submitLabel = "Submit" }: { title: string; fields: Field[]; submitLabel?: string }) {
  const [sent, setSent] = useState(false);
  const schema = buildSchema(fields);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });
  const base = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/30";

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto h-10 w-10 text-accent" />
        <h3 className="mt-3 text-xl font-bold text-primary">Details checked</h3>
        <p className="mt-2 text-sm text-muted-foreground">Online submission is not connected yet, so this form was not sent. Please reach MDL directly for now.</p>
        <Button variant="outline" className="mt-5" onClick={() => setSent(false)}>Back to form</Button>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit(() => setSent(true))} className="rounded-xl border border-border bg-card p-6 shadow-card md:p-8" noValidate>
      <h3 className="mb-5 text-xl font-bold text-primary">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => (
          <label key={f.name} className={`text-sm font-medium ${f.full || f.type === "textarea" ? "md:col-span-2" : ""}`}>
            {f.label}{f.required && <span className="text-accent"> *</span>}
            {f.type === "textarea" ? (
              <textarea rows={4} {...register(f.name)} className={base} />
            ) : f.type === "select" ? (
              <select {...register(f.name)} className={base} defaultValue="">
                <option value="">Select…</option>
                {f.options?.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type ?? "text"} {...register(f.name)} className={base} />
            )}
            {errors[f.name] && <span className="mt-1 block text-xs text-destructive">{String(errors[f.name]?.message)}</span>}
          </label>
        ))}
      </div>
      <Button type="submit" variant="gold" size="lg" className="mt-6 w-full md:w-auto" disabled={isSubmitting}>{submitLabel}</Button>
    </form>
  );
}

export const contactBasics: Field[] = [
  { name: "fullName", label: "Full name", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone", label: "Phone", type: "tel", required: true },
];
