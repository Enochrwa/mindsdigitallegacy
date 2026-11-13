import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, Notice } from "@/components/auth/AuthShell";
import { failureText, inputClass } from "@/components/auth/helpers";
import type { ApiResult } from "@/lib/api";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email") });
type Values = z.infer<typeof schema>;

/** One email field and a generic confirmation. Shared by "forgot password" and "resend verification". */
export function EmailRequestForm({
  submit,
  submitLabel,
  confirmation,
}: {
  submit: (email: string) => Promise<ApiResult<unknown>>;
  submitLabel: string;
  confirmation: string;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }: Values) => {
    setError(null);
    const result = await submit(email);
    if (result.ok) setSent(true);
    else setError(failureText(result.reason));
  };

  if (sent) return <Notice kind="success">{confirmation}</Notice>;
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field label="Email" error={errors.email?.message}>
        <input type="email" autoComplete="email" {...register("email")} className={inputClass} />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <Button type="submit" variant="gold" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
