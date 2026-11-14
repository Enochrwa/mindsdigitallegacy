/**
 * Common throw-away email domains refused for referral credit (ADR-0002). A starting list, not a
 * complete one: staff add more in settings without a deploy. The account itself is still allowed.
 */
export const BUILT_IN_DISPOSABLE_DOMAINS: readonly string[] = [
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "tempmailo.com",
  "yopmail.com",
  "yopmail.net",
  "trashmail.com",
  "trashmail.net",
  "getnada.com",
  "nada.email",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
  "fakeinbox.com",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "emailondeck.com",
  "spamgourmet.com",
  "mytemp.email",
  "tempinbox.com",
  "burnermail.io",
  "moakt.com",
  "discard.email",
  "mailcatch.com",
  "inboxkitten.com",
  "tmpmail.org",
  "tmpmail.net",
  "dropmail.me",
  "33mail.com",
];

/**
 * One key for "the same mailbox": lower-case, plus-tag removed, and dots removed for Gmail, so
 * ada+1@gmail.com, a.da@gmail.com and ada@googlemail.com all collapse together. Hashed, so the referral
 * table never stores a second copy of the address.
 */
export function canonicalEmail(email: string): string {
  const [localRaw = "", domainRaw = ""] = email.trim().toLowerCase().split("@");
  const domain = domainRaw === "googlemail.com" ? "gmail.com" : domainRaw;
  let local = localRaw.split("+")[0] ?? "";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

export const emailDomain = (email: string): string =>
  email.trim().toLowerCase().split("@")[1] ?? "";

export function isBlockedDomain(email: string, extra: readonly string[]): boolean {
  const domain = emailDomain(email);
  const all = new Set([...BUILT_IN_DISPOSABLE_DOMAINS, ...extra]);
  // Also catches subdomains of a blocked domain (x.mailinator.com).
  return [...all].some((d) => domain === d || domain.endsWith(`.${d}`));
}
