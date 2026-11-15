import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportUrl } from "@/lib/admin";
import type { ExportKind } from "@/lib/admin";

/** Downloads a CSV with the session cookie (works even when the API is on another origin). Audited by the server. */
export function ExportButton({
  kind,
  filters,
  label = "Export CSV",
}: {
  kind: ExportKind;
  filters?: Record<string, string | undefined>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const response = await fetch(exportUrl(kind, filters), { credentials: "include" });
      if (!response.ok) {
        toast.error(
          response.status === 403
            ? "You are not allowed to export this data."
            : "The export failed. Please try again.",
        );
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `mdl-${kind}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded. This action is recorded in the audit log.");
    } catch {
      toast.error("We could not reach the server.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={download} disabled={busy}>
      <Download aria-hidden /> {busy ? "Preparing…" : label}
    </Button>
  );
}
