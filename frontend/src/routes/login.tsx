import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { AuthShell, Field, Notice } from "@/components/auth/AuthShell";
import { authHead, failureText, inputClass } from "@/components/auth/helpers";
import { api } from "@/lib/api";
import { useRefreshSession } from "@/lib/session";

export const Route = createFileRoute("/login")({
  head: authHead("Sign in"),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

function LoginPage() {
  const navigate = useNavigate();
  const refresh = useRefreshSession();
  const [error, setError] = useState<{ text: string; inactive: boolean } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setError(null);
    const result = await api.auth.login(values.email, values.password);
    if (result.ok) {
      await refresh();
      await navigate({ to: "/account" });
      return;
    }
    if (result.reason === "invalid_credentials") {
      setError({ text: "Email or password is incorrect.", inactive: false });
    } else if (result.reason === "account_not_active") {
      setError({
        text: "Your account is not active yet. Open the verification link we emailed you. If you are under 16, your parent or guardian must also confirm.",
        inactive: true,
      });
    } else {
      setError({ text: failureText(result.reason), inactive: false });
    }
  };

  return (
    <AuthShell eyebrow="Account" title="Sign in">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Email" error={errors.email?.message}>
          <input type="email" autoComplete="email" {...register("email")} className={inputClass} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="current-password"
            {...register("password")}
            className={inputClass}
          />
        </Field>
        {error && (
          <Notice kind="error">
            {error.text}{" "}
            {error.inactive && (
              <Link to="/resend-verification" className="font-medium underline">
                Send a new verification link
              </Link>
            )}
          </Notice>
        )}
        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/forgot-password" className="font-medium text-primary underline">
            Forgot your password?
          </Link>
          {" · "}
          <Link to="/register" className="font-medium text-primary underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
