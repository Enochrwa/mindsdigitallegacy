import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { authHead } from "@/components/auth/helpers";
import { EmailRequestForm } from "@/components/auth/EmailRequestForm";
import { api } from "@/lib/api";

export const Route = createFileRoute("/resend-verification")({
  head: authHead("Resend verification"),
  component: () => (
    <AuthShell eyebrow="Account" title="Send a new verification link">
      <EmailRequestForm
        submit={api.auth.resendVerification}
        submitLabel="Send link"
        confirmation="If this address has an account waiting for verification, we have sent a new link."
      />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  ),
});
