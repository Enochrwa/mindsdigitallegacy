import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { authHead } from "@/components/auth/helpers";
import { TokenConfirm } from "@/components/auth/TokenConfirm";
import { api } from "@/lib/api";

export const Route = createFileRoute("/verify-email")({
  head: authHead("Confirm your email"),
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  component: VerifyEmail,
});

function VerifyEmail() {
  const { token } = Route.useSearch();
  return (
    <AuthShell eyebrow="Account" title="Confirm your email">
      <TokenConfirm
        token={token}
        confirm={api.auth.verifyEmail}
        prompt="Press the button to confirm that this email address is yours."
        buttonLabel="Confirm my email"
        successText="Your email is confirmed. If you are under 16, your account becomes active once your parent or guardian has also confirmed."
        retryTo="/resend-verification"
      />
    </AuthShell>
  );
}
