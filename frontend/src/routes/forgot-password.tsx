import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { authHead } from "@/components/auth/helpers";
import { EmailRequestForm } from "@/components/auth/EmailRequestForm";
import { api } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  head: authHead("Forgot password"),
  component: () => (
    <AuthShell
      eyebrow="Account"
      title="Reset your password"
      text="We will email you a link if an account exists for your address."
    >
      <EmailRequestForm
        submit={api.auth.forgotPassword}
        submitLabel="Send reset link"
        confirmation="If an account exists for this address, we have sent a reset link. It works once and expires in one hour."
      />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  ),
});
