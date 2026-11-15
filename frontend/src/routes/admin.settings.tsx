import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCan } from "@/components/admin/meta";
import {
  ErrorState,
  Field,
  Notice,
  PageHeader,
  PageSkeleton,
  Panel,
  Toggle,
  inputCls,
} from "@/components/admin/ui";
import {
  adminApi,
  diffSettings,
  formatDate,
  humanize,
  parseList,
  settingsIssues,
  useAdminAction,
  useAdminQuery,
} from "@/lib/admin";
import type { PlatformSettings, StoredSettings } from "@/lib/admin";

export const Route = createFileRoute("/admin/settings")({ component: SettingsPage });

function SettingsPage() {
  const query = useAdminQuery<StoredSettings>("/settings");
  if (query.isPending) return <PageSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  // Re-keyed by version so a reload or a successful save starts a clean draft from the server copy.
  return <SettingsForm key={query.data.version} stored={query.data} />;
}

const num = (v: number): number | string => (Number.isFinite(v) ? v : "");

function SettingsForm({ stored }: { stored: StoredSettings }) {
  const canManage = useCan("settings:manage");
  const { run, busy } = useAdminAction();
  const [draft, setDraft] = useState<PlatformSettings>(stored.settings);
  const [domains, setDomains] = useState(stored.settings.referral.blockedEmailDomains.join("\n"));
  const [reviewing, setReviewing] = useState(false);
  const [stale, setStale] = useState(false);
  const [resets, setResets] = useState(0);

  const referral = draft.referral;
  const withReferral = (patch: Partial<PlatformSettings["referral"]>) =>
    setDraft({ ...draft, referral: { ...referral, ...patch } });
  const changes = diffSettings(stored.settings, draft);
  const issues = settingsIssues(draft);
  const dirty = changes.length > 0;
  const invalid = Object.keys(issues).length > 0;
  const nums = (value: string): number[] =>
    value
      .split(/[,\s]+/)
      .filter((t) => t !== "")
      .map(Number);

  const save = async () => {
    const result = await run(
      () => adminApi.put<StoredSettings>("/settings", { settings: draft, version: stored.version }),
      { success: "Settings saved. The change is in the audit log.", refresh: ["/settings"] },
    );
    setReviewing(false);
    if (!result.ok && result.reason === "rejected" && result.code === "STALE_SETTINGS")
      setStale(true);
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform rules you can change without a release. Every change is versioned and recorded."
      />
      {stale && (
        <div className="mb-4">
          <Notice kind="error">
            Someone else saved settings while you were editing. Your draft was not saved.{" "}
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Reload their version
            </Button>
          </Notice>
        </div>
      )}
      {!canManage && (
        <div className="mb-4">
          <Notice kind="info">You can view settings but only admins can change them.</Notice>
        </div>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !invalid) setReviewing(true);
        }}
      >
        <fieldset disabled={!canManage || busy} className="space-y-4">
          <legend className="sr-only">Platform settings</legend>

          <Panel
            title="Referral rewards"
            description="How many friends a learner must bring to unlock free training."
          >
            <div className="space-y-4">
              <Toggle
                label="Referral programme on"
                hint="When off, referral-gated courses stay locked unless a learner has a code or manual access."
                checked={referral.enabled}
                onChange={(enabled) => withReferral({ enabled })}
              />
              <Field
                label="Friends needed to unlock"
                hint="Verified friends who join with your link."
                error={issues["threshold"]}
                className="max-w-xs"
              >
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  max={50}
                  value={num(referral.threshold)}
                  onChange={(e) => withReferral({ threshold: e.target.valueAsNumber })}
                />
              </Field>
              <div className="border-t border-border pt-4">
                <Toggle
                  label="Run an A/B test on the number"
                  hint="Each new referrer is given one of the numbers below for good, so results stay comparable. The funnel on the Referrals page is split by number."
                  checked={referral.experiment.enabled}
                  onChange={(enabled) =>
                    withReferral({ experiment: { ...referral.experiment, enabled } })
                  }
                />
                <Field
                  label="Numbers to test"
                  hint="2 to 4 different numbers separated by commas, for example 3, 5."
                  error={issues["experiment"]}
                  className="mt-3 max-w-xs"
                >
                  <input
                    key={resets}
                    className={inputCls}
                    defaultValue={stored.settings.referral.experiment.thresholds.join(", ")}
                    inputMode="numeric"
                    onChange={(e) =>
                      withReferral({
                        experiment: { ...referral.experiment, thresholds: nums(e.target.value) },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel
            title="Abuse protection"
            description="Referrals over these limits are held for a human decision instead of counting automatically."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Most friends from one network"
                hint="Per referrer, people joining from the same internet connection."
                error={issues["network"]}
              >
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  max={50}
                  value={num(referral.maxQualifiedPerNetwork)}
                  onChange={(e) => withReferral({ maxQualifiedPerNetwork: e.target.valueAsNumber })}
                />
              </Field>
              <Field
                label="Most new sign-ups per link per day"
                hint="A sudden burst is a sign of automation."
                error={issues["velocity"]}
              >
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  max={500}
                  value={num(referral.maxNewPerCodePerDay)}
                  onChange={(e) => withReferral({ maxNewPerCodePerDay: e.target.valueAsNumber })}
                />
              </Field>
            </div>
            <Field
              label="Extra blocked email domains"
              hint="One per line. These are on top of the built-in list of throwaway email services. People can still register, but referrals from these addresses do not count."
              error={issues["domains"]}
              className="mt-4"
            >
              <textarea
                className={`${inputCls} min-h-28 font-mono`}
                value={domains}
                spellCheck={false}
                onChange={(e) => {
                  setDomains(e.target.value);
                  withReferral({ blockedEmailDomains: parseList(e.target.value) });
                }}
              />
            </Field>
          </Panel>

          <Panel title="Sign-ups" description="An emergency brake for an abuse wave.">
            <Toggle
              label="Accept new registrations"
              hint="Turn off to stop new accounts while keeping the site and existing learners running."
              checked={draft.registration.open}
              onChange={(open) => setDraft({ ...draft, registration: { open } })}
            />
            {!draft.registration.open && (
              <p className="mt-2 text-xs text-destructive" role="status">
                New people will see a message that registration is paused.
              </p>
            )}
          </Panel>

          <Panel title="Site announcement" description="A short banner shown to everyone.">
            <Toggle
              label="Show the banner"
              checked={draft.announcement.enabled}
              onChange={(enabled) =>
                setDraft({ ...draft, announcement: { ...draft.announcement, enabled } })
              }
            />
            <Field
              label="Message"
              hint={`${draft.announcement.message.length} of 200 characters. Plain text only.`}
              error={issues["announcement"]}
              className="mt-3"
            >
              <input
                className={inputCls}
                maxLength={200}
                value={draft.announcement.message}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    announcement: { ...draft.announcement, message: e.target.value },
                  })
                }
              />
            </Field>
          </Panel>
        </fieldset>

        {canManage && (
          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
            <Button type="submit" disabled={!dirty || invalid || busy}>
              Review changes{dirty ? ` (${changes.length})` : ""}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!dirty || busy}
              onClick={() => {
                setDraft(stored.settings);
                setResets(resets + 1);
                setDomains(stored.settings.referral.blockedEmailDomains.join("\n"));
              }}
            >
              Discard changes
            </Button>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {invalid
                ? "Fix the highlighted fields to continue."
                : dirty
                  ? "You have unsaved changes."
                  : `Version ${stored.version}${stored.updatedAt ? `, last saved ${formatDate(stored.updatedAt, true)}` : ""}.`}
            </p>
          </div>
        )}
      </form>

      <Dialog open={reviewing} onOpenChange={setReviewing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save these changes?</DialogTitle>
            <DialogDescription>
              They apply to everyone straight away and are recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {changes.map((c) => (
              <li key={c.path} className="rounded-md border border-border p-2">
                <span className="font-medium">{humanize(c.path.replace(/\./g, " › "))}</span>
                <br />
                <span className="text-muted-foreground line-through">{c.from}</span>
                {" → "}
                <span className="font-medium">{c.to}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(false)}>
              Keep editing
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
