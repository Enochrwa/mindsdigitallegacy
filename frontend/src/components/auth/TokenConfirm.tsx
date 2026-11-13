import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/auth/AuthShell";
import { failureText } from "@/components/auth/helpers";
import type { ApiResult } from "@/lib/api";

/**
 * Confirms a one-time emailed link with an explicit button press. Not automatic on load: mail scanners
 * and link previewers fetch URLs, and a guardian's consent must be a deliberate act. The token is kept in
 * memory and removed from the address bar straight away so it is not left in history.
 */
export function TokenConfirm({
  token,
  confirm,
  prompt,
  buttonLabel,
  successText,
  retryTo,
}: {
  token: string | undefined;
  confirm: (token: string) => Promise<ApiResult<unknown>>;
  prompt: string;
  buttonLabel: string;
  successText: string;
  retryTo: "/resend-verification" | "/forgot-password";
}) {
  const navigate = useNavigate();
  const [held] = useState(token);
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (token !== undefined) void navigate({ to: ".", search: {}, replace: true });
  }, [token, navigate]);

  if (held === undefined) {
    return (
      <Notice kind="error">
        This link is incomplete. Open the link from your email again, or request a new one.
      </Notice>
    );
  }
  if (state === "done") {
    return (
      <>
        <Notice kind="success">{successText}</Notice>
        <Button asChild variant="gold" className="mt-4">
          <Link to="/login">Continue to sign in</Link>
        </Button>
      </>
    );
  }
  const run = async () => {
    setState("working");
    const result = await confirm(held);
    if (result.ok) setState("done");
    else {
      setMessage(failureText(result.reason));
      setState("failed");
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{prompt}</p>
      {state === "failed" && (
        <Notice kind="error">
          {message}{" "}
          <Link to={retryTo} className="font-medium underline">
            Request a new link
          </Link>
        </Notice>
      )}
      <Button
        variant="gold"
        size="lg"
        className="w-full"
        onClick={run}
        disabled={state === "working"}
      >
        {state === "working" ? "Please wait…" : buttonLabel}
      </Button>
    </div>
  );
}
