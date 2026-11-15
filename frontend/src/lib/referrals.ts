import { request } from "./api";

export interface SiteInfo {
  registrationOpen: boolean;
  referralEnabled: boolean;
  announcement: string | null;
}

export interface ReferralStatus {
  enabled: boolean;
  code: string;
  threshold: number;
  joined: number;
  waiting: number;
  unlocked: boolean;
}

/** Same alphabet as the server (no 0/O/1/I/L), so typos are caught before any request. */
const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;
const STORAGE_KEY = "mdl.referral";

export const normaliseCode = (raw: string): string => raw.trim().toUpperCase();
export const looksLikeCode = (raw: string): boolean => CODE_PATTERN.test(normaliseCode(raw));

/** Browser storage can be missing or throw (private windows), so every use is guarded. */
export function rememberCode(code: string): void {
  try {
    if (looksLikeCode(code)) localStorage.setItem(STORAGE_KEY, normaliseCode(code));
  } catch {
    /* storage unavailable: the code can still be typed in by hand */
  }
}

export function recalledCode(): string {
  try {
    const value = localStorage.getItem(STORAGE_KEY) ?? "";
    return looksLikeCode(value) ? value : "";
  } catch {
    return "";
  }
}

export function forgetCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to forget */
  }
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin}/r/${code}`;
}

export const SHARE_MESSAGE =
  "I'm learning free digital skills with Minds Digital Legacy. Join me and unlock free courses:";

/** Share targets that need no SDK or tracking script: plain links the person's own app opens. */
export function shareLinks(url: string): { id: string; label: string; href: string }[] {
  const text = encodeURIComponent(`${SHARE_MESSAGE} ${url}`);
  const u = encodeURIComponent(url);
  return [
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${text}` },
    { id: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${text}` },
    {
      id: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    },
    {
      id: "telegram",
      label: "Telegram",
      href: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(SHARE_MESSAGE)}`,
    },
    {
      id: "email",
      label: "Email",
      href: `mailto:?subject=${encodeURIComponent("Free digital skills courses")}&body=${text}`,
    },
  ];
}

/** 0–100 for the progress bar; never above 100 and safe when the threshold is 0. */
export function progressPercent(joined: number, threshold: number): number {
  if (threshold <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((joined / threshold) * 100)));
}

export const referralApi = {
  site: () => request<SiteInfo>("GET", "/site"),
  me: () => request<ReferralStatus>("GET", "/referrals/me"),
  visit: (code: string) => request<undefined>("POST", "/referrals/visit", { code }),
  redeem: (code: string) => request<{ status: string }>("POST", "/unlock/redeem", { code }),
};
