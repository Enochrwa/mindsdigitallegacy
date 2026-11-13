import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { AuthShell, Field, Notice } from "@/components/auth/AuthShell";
import {
  PASSWORD_HINT,
  authHead,
  failureText,
  inputClass,
  problemMap,
} from "@/components/auth/helpers";
import { api } from "@/lib/api";

export const Route = createFileRoute("/reset-password")({
  head: authHead("Choose a new password"),
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  component: ResetPassword,
});

const schema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(128, "Use at most 128 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The passwords do not match",
  });
type Values = z.infer<typeof schema>;

function ResetPassword() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [held] = useState(token);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  // Keep the token out of the address bar and browser history once it has been read.
  useEffect(() => {
    if (token !== undefined) void navigate({ to: ".", search: {}, replace: true });
  }, [token, navigate]);

  if (held === undefined) {
    return (
      <AuthShell eyebrow="Account" title="Choose a new password">
        <Notice kind="error">
          This link is incomplete.{" "}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new one
          </Link>
          .
        </Notice>
      </AuthShell>
    );
  }
  if (done) {
    return (
      <AuthShell eyebrow="Account" title="Password updated">
        <Notice kind="success">
          Your password was changed and you were signed out everywhere. Sign in with the new one.
        </Notice>
        <Button asChild variant="gold" className="mt-4">
          <Link to="/login">Sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  const onSubmit = async (values: Values) => {
    setError(null);
    const result = await api.auth.resetPassword(held, values.password);
    if (result.ok) {
      setDone(true);
      return;
    }
    if (result.reason === "validation") {
      const message = problemMap(result.problems)["password"];
      if (message) {
        setFieldError("password", { message });
        return;
      }
    }
    setError(failureText(result.reason));
  };

  return (
    <AuthShell eyebrow="Account" title="Choose a new password">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="New password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="new-password"
            {...register("password")}
            className={inputClass}
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {PASSWORD_HINT}
          </span>
        </Field>
        <Field label="Repeat the new password" error={errors.confirm?.message}>
          <input
            type="password"
            autoComplete="new-password"
            {...register("confirm")}
            className={inputClass}
          />
        </Field>
        {error && (
          <Notice kind="error">
            {error}{" "}
            <Link to="/forgot-password" className="font-medium underline">
              Request a new link
            </Link>
          </Notice>
        )}
        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </AuthShell>
  );
}
