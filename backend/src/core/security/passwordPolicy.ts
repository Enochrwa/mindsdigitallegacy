/**
 * Password policy (LLD section 4): length over composition rules, plus a deny-list.
 * The embedded list is deliberately small; checking against breached-password data (k-anonymity
 * range API) is a planned hardening step, not done here.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const COMMON = new Set(
  [
    "password",
    "password1",
    "password123",
    "1234567890",
    "12345678910",
    "0123456789",
    "qwertyuiop",
    "qwerty12345",
    "iloveyou12",
    "welcome123",
    "admin12345",
    "letmein123",
    "abcdefghij",
    "mindsdigital",
    "mindsdigitallegacy",
    "rwanda12345",
    "kigali12345",
    "changeme123",
    "passw0rd123",
    "1q2w3e4r5t",
  ].map((value) => value.toLowerCase()),
);

export interface PasswordContext {
  email: string;
  displayName: string;
}

/** Returns a user-safe reason, or undefined when the password is acceptable. */
export function checkPassword(password: string, context: PasswordContext): string | undefined {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "This password is too common.";
  if (/^(.)\1+$/.test(password)) return "This password is too repetitive.";
  const local = context.email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && lower.includes(local)) return "Do not use your email in your password.";
  const name = context.displayName.toLowerCase().replace(/\s+/g, "");
  if (name.length >= 4 && lower.replace(/\s+/g, "").includes(name)) {
    return "Do not use your name in your password.";
  }
  return undefined;
}
