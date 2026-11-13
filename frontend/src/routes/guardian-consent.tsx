import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { authHead } from "@/components/auth/helpers";
import { TokenConfirm } from "@/components/auth/TokenConfirm";
import { api } from "@/lib/api";

export const Route = createFileRoute("/guardian-consent")({
  head: authHead("Guardian consent"),
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  component: GuardianConsent,
});

function GuardianConsent() {
  const { token } = Route.useSearch();
  return (
    <AuthShell eyebrow="Parents and guardians" title="Consent for a young learner">
      <TokenConfirm
        token={token}
        confirm={api.auth.confirmGuardian}
        prompt="A learner under 16 asked to join Minds Digital Legacy and named you as their parent or guardian. If you know them and agree to their account and to MDL processing their details as described in our privacy notice, press the button. If not, close this page: nothing will be activated."
        buttonLabel="I am the parent or guardian and I consent"
        successText="Thank you. Your consent is recorded. The learner's account can now be used once their email is verified."
        retryTo="/resend-verification"
      />
    </AuthShell>
  );
}
