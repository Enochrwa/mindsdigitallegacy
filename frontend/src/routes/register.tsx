import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { PRIVACY_NOTICE_VERSION, api } from "@/lib/api";

export const Route = createFileRoute("/register")({
  head: authHead("Create your account"),
  component: RegisterPage,
});

const schema = z
  .object({
    displayName: z.string().trim().min(2, "Enter your name").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(128, "Use at most 128 characters"),
    ageBracket: z.enum(["16_plus", "under_16"], { message: "Select your age group" }),
    guardianEmail: z.string().trim().toLowerCase().max(254).optional(),
    consent: z.boolean().refine((v) => v, "Please accept the privacy notice to continue"),
  })
  .superRefine((v, ctx) => {
    if (v.ageBracket !== "under_16") return;
    if (
      !z
        .string()
        .email()
        .safeParse(v.guardianEmail ?? "").success
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["guardianEmail"],
        message: "Enter your parent or guardian's email",
      });
    } else if (v.guardianEmail === v.email) {
      ctx.addIssue({
        code: "custom",
        path: ["guardianEmail"],
        message: "This must be a different email from your own",
      });
    }
  });

type Values = z.infer<typeof schema>;

function RegisterPage() {
  const [done, setDone] = useState<{ email: string; needsGuardian: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { consent: false } });
  const under16 = watch("ageBracket") === "under_16";

  const onSubmit = async (values: Values) => {
    setError(null);
    const result = await api.auth.register({
      email: values.email,
      password: values.password,
      displayName: values.displayName,
      ageBracket: values.ageBracket,
      ...(values.ageBracket === "under_16" && values.guardianEmail
        ? { guardianEmail: values.guardianEmail }
        : {}),
      consent: true,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    });
    if (result.ok) {
      setDone({ email: values.email, needsGuardian: values.ageBracket === "under_16" });
      return;
    }
    if (result.reason === "validation") {
      const mapped = problemMap(result.problems);
      for (const [path, message] of Object.entries(mapped)) {
        if (
          path === "password" ||
          path === "email" ||
          path === "displayName" ||
          path === "guardianEmail"
        ) {
          setFieldError(path, { message });
        }
      }
      if (Object.keys(mapped).length > 0) return;
    }
    setError(failureText(result.reason));
  };

  if (done) {
    return (
      <AuthShell eyebrow="Account" title="Check your email">
        <Notice kind="success">
          If this address can be registered, we have sent a verification link to {done.email}. Open
          it to activate your account.
          {done.needsGuardian &&
            " We also emailed your parent or guardian: your account stays inactive until they confirm."}
        </Notice>
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing arrived after a few minutes? Check your spam folder, then{" "}
          <Link to="/resend-verification" className="font-medium text-primary underline">
            ask for a new link
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Account"
      title="Create your account"
      text="Free learning starts with a verified account."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Full name" error={errors.displayName?.message}>
          <input autoComplete="name" {...register("displayName")} className={inputClass} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" autoComplete="email" {...register("email")} className={inputClass} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
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
        <Field label="Age group" error={errors.ageBracket?.message}>
          <select defaultValue="" {...register("ageBracket")} className={inputClass}>
            <option value="">Select…</option>
            <option value="16_plus">16 or older</option>
            <option value="under_16">Under 16</option>
          </select>
        </Field>
        {under16 && (
          <Field label="Parent or guardian email" error={errors.guardianEmail?.message}>
            <input type="email" {...register("guardianEmail")} className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              We email them to confirm. Your account cannot be used until they do.
            </span>
          </Field>
        )}
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" {...register("consent")} className="mt-1 h-4 w-4" />
            <span>
              I agree that MDL may store and use my details to run my account, as described in the{" "}
              <Link to="/privacy" className="font-medium text-primary underline">
                privacy notice
              </Link>
              .
            </span>
          </label>
          {errors.consent && (
            <span className="mt-1 block text-xs text-destructive">{errors.consent.message}</span>
          )}
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create account"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
