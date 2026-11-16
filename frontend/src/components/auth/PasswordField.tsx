import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Dices, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { scorePassword, generatePassphrase } from "@/lib/password";

/** Four stepped diamonds, filled one by one as the password gets stronger. */
function StrengthDiamonds({ level }: { level: number }) {
  const colors = ["#c6452d", "#e07a2b", "#c9a020", "#2f9e6b"];
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <svg key={n} width="14" height="14" viewBox="0 0 14 14">
          <path
            d="M7 .5 13.5 7 7 13.5.5 7Z"
            fill={n <= level ? (colors[level - 1] ?? "#c6452d") : "transparent"}
            stroke={n <= level ? (colors[level - 1] ?? "#c6452d") : "currentColor"}
            strokeOpacity={n <= level ? 1 : 0.3}
            strokeWidth="1.2"
          />
        </svg>
      ))}
    </span>
  );
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  label: string;
  error?: string | undefined;
  /** Show the strength meter, tips and a passphrase suggestion (for new passwords only). */
  meter?: boolean;
  /** Words that must not appear in the password (name, email). Used by the meter only. */
  personal?: string[];
  /** Current value. Required for the meter and the suggestion button. */
  value?: string;
  /** Called with a suggested passphrase so the form can store it. */
  onSuggest?: (value: string) => void;
  hint?: string;
};

/**
 * Password input with a real show/hide button, a Caps Lock warning, and (for new passwords) a
 * strength meter and a "suggest a passphrase" button. The toggle is a proper button with
 * aria-pressed, so keyboard and screen-reader users get the same control.
 */
export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  { label, error, meter = false, personal = [], value = "", onSuggest, hint, className, ...rest },
  ref,
) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const id = useId();
  const strength = meter ? scorePassword(value, personal) : null;
  const describedBy = [
    error ? `${id}-err` : null,
    hint ? `${id}-hint` : null,
    meter ? `${id}-meter` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          {...rest}
          ref={ref}
          id={id}
          type={shown ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
          onBlur={(e) => {
            setCaps(false);
            rest.onBlur?.(e);
          }}
          className={`auth-input pr-12 ${className ?? ""}`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          {shown ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {caps && (
        <p
          role="status"
          className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[#9a5b00]"
        >
          <TriangleAlert className="h-3.5 w-3.5" /> Caps Lock is on.
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      {meter && (
        <div id={`${id}-meter`} className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StrengthDiamonds level={strength?.level ?? 0} />
          <span aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
            {strength && strength.level > 0
              ? `${strength.label}${strength.tips[0] ? `. ${strength.tips[0]}` : ""}`
              : "Use a few random words. Longer beats complicated."}
          </span>
          {onSuggest && (
            <button
              type="button"
              onClick={() => {
                onSuggest(generatePassphrase());
                setShown(true);
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Dices className="h-3.5 w-3.5" /> Suggest a passphrase
            </button>
          )}
        </div>
      )}
    </div>
  );
});
