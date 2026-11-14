import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ApiFailure } from "@/lib/api";
import { AGE_FORMS, FIELD_LIMITS, toLeadPayload } from "@/lib/leads";
import type { FormKey } from "@/lib/leads";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  options?: readonly string[];
  required?: boolean;
  full?: boolean;
};

// Same rule as the API (backend leads.schema.ts), so a value accepted here is accepted there.
const PHONE = /^\+?[0-9][0-9 ()-]{5,19}$/;

function buildSchema(form: FormKey, fields: Field[]) {
  const limits = FIELD_LIMITS[form];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    const max = limits[f.name] ?? (f.type === "textarea" ? 2000 : 200);
    let s = z.string().trim().max(max, `Please keep this under ${max} characters`);
    if (f.type === "email") s = s.email("Enter a valid email");
    if (f.type === "tel") s = s.regex(PHONE, "Enter a valid phone number");
    shape[f.name] = f.required ? s.min(1, `${f.label} is required`) : s.or(z.literal(""));
  }
  shape["consent"] = z.boolean().refine((v) => v, "Please accept the privacy notice to continue");
  shape["website"] = z.string().max(200).optional(); // honeypot
  if (AGE_FORMS.has(form)) {
    shape["ageBracket"] = z.enum(["16_plus", "under_16"], { message: "Select your age group" });
    shape["guardianContact"] = z.string().trim().max(150).optional();
  }
  return z.object(shape).superRefine((v, ctx) => {
    if (v["ageBracket"] === "under_16" && String(v["guardianContact"] ?? "").trim().length < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["guardianContact"],
        message: "A parent or guardian contact is required under 16",
      });
    }
  });
}

const FAILURE_TEXT: Partial<Record<ApiFailure["reason"], string>> = {
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  network: "We could not reach our servers. Check your connection and try again.",
  unavailable: "Something went wrong on our side. Please try again later or contact us directly.",
  validation: "Some details were not accepted. Please check the form and try again.",
};

export function LeadForm({
  form,
  title,
  fields,
  submitLabel = "Submit",
}: {
  form: FormKey;
  title: string;
  fields: Field[];
  submitLabel?: string;
}) {
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const schema = buildSchema(form, fields);
  const needsAge = AGE_FORMS.has(form);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { consent: false } });
  const base =
    "mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/30";
  const under16 = needsAge && watch("ageBracket") === "under_16";

  const onSubmit = async (data: Record<string, unknown>) => {
    setFailure(null);
    const { consent: _consent, website, ageBracket, guardianContact, ...values } = data;
    const payload = toLeadPayload(form, {
      values: values as Record<string, string | undefined>,
      ageBracket: ageBracket as "under_16" | "16_plus" | undefined,
      guardianContact: guardianContact as string | undefined,
      website: website as string | undefined,
    });
    const result = await api.leads.submit(payload);
    if (result.ok) {
      reset();
      setSent(true);
    } else {
      setFailure(FAILURE_TEXT[result.reason] ?? FAILURE_TEXT["unavailable"] ?? "");
    }
  };

  if (sent) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center shadow-card"
        role="status"
      >
        <CheckCircle2 className="mx-auto h-10 w-10 text-accent" />
        <h3 className="mt-3 text-xl font-bold text-primary">Thank you, we have your details</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Our team will get back to you using the contact details you gave. If you do not hear from
          us within a few days, please contact us directly.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => setSent(false)}>
          Send another
        </Button>
      </div>
    );
  }
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-xl border border-border bg-card p-6 shadow-card md:p-8"
      noValidate
    >
      <h3 className="mb-5 text-xl font-bold text-primary">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => (
          <label
            key={f.name}
            className={`text-sm font-medium ${f.full || f.type === "textarea" ? "md:col-span-2" : ""}`}
          >
            {f.label}
            {f.required && <span className="text-accent"> *</span>}
            {f.type === "textarea" ? (
              <textarea rows={4} {...register(f.name)} className={base} />
            ) : f.type === "select" ? (
              <select {...register(f.name)} className={base} defaultValue="">
                <option value="">Select…</option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input type={f.type ?? "text"} {...register(f.name)} className={base} />
            )}
            {errors[f.name] && (
              <span className="mt-1 block text-xs text-destructive">
                {String(errors[f.name]?.message)}
              </span>
            )}
          </label>
        ))}
        {needsAge && (
          <>
            <label className="text-sm font-medium">
              Age group<span className="text-accent"> *</span>
              <select {...register("ageBracket")} className={base} defaultValue="">
                <option value="">Select…</option>
                <option value="16_plus">16 or older</option>
                <option value="under_16">Under 16</option>
              </select>
              {errors["ageBracket"] && (
                <span className="mt-1 block text-xs text-destructive">
                  {String(errors["ageBracket"]?.message)}
                </span>
              )}
            </label>
            {under16 && (
              <label className="text-sm font-medium">
                Parent or guardian email or phone<span className="text-accent"> *</span>
                <input type="text" {...register("guardianContact")} className={base} />
                {errors["guardianContact"] && (
                  <span className="mt-1 block text-xs text-destructive">
                    {String(errors["guardianContact"]?.message)}
                  </span>
                )}
              </label>
            )}
          </>
        )}
      </div>
      {/* Honeypot: hidden from people and assistive tech, bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>
      <div className="mt-5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" {...register("consent")} className="mt-1 h-4 w-4" />
          <span>
            I agree that MDL may store and use these details to respond to me, as described in the{" "}
            <Link to="/privacy" className="font-medium text-primary underline">
              privacy notice
            </Link>
            .
          </span>
        </label>
        {errors["consent"] && (
          <span className="mt-1 block text-xs text-destructive">
            {String(errors["consent"]?.message)}
          </span>
        )}
      </div>
      {failure && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {failure}
        </p>
      )}
      <Button
        type="submit"
        variant="gold"
        size="lg"
        className="mt-6 w-full md:w-auto"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}

export const contactBasics: Field[] = [
  { name: "fullName", label: "Full name", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone", label: "Phone", type: "tel", required: true },
];
