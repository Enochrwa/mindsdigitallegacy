import { z } from "zod";

/**
 * Platform settings the founders can change without a deploy. One document, versioned, every change
 * audited with who and when. Defaults live here so a fresh database already behaves sensibly.
 */
export const settingsSchema = z.strictObject({
  referral: z.strictObject({
    /** Master switch. When off, referral-gated courses stay locked until another unlock path is used. */
    enabled: z.boolean(),
    /** Verified invitees needed to unlock free training (ADR-0002 default 3). */
    threshold: z.number().int().min(1).max(50),
    /** A/B test: each new referrer is assigned one of these thresholds for good, so results stay comparable. */
    experiment: z.strictObject({
      enabled: z.boolean(),
      thresholds: z.array(z.number().int().min(1).max(50)).min(2).max(4),
    }),
    /** Qualified invitees from one network (/24) per referrer beyond which the rest wait for staff review. */
    maxQualifiedPerNetwork: z.number().int().min(1).max(50),
    /** New attributions per code per 24 hours beyond which the rest wait for staff review. */
    maxNewPerCodePerDay: z.number().int().min(1).max(500),
    /** Extra email domains refused for referral credit, on top of the built-in disposable list. */
    blockedEmailDomains: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
      )
      .max(500),
  }),
  registration: z.strictObject({
    /** Close new sign-ups in an emergency (abuse wave) without taking the site down. */
    open: z.boolean(),
  }),
  announcement: z.strictObject({
    enabled: z.boolean(),
    message: z.string().trim().max(200),
  }),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  referral: {
    enabled: true,
    threshold: 3,
    experiment: { enabled: false, thresholds: [3, 5] },
    maxQualifiedPerNetwork: 3,
    maxNewPerCodePerDay: 20,
    blockedEmailDomains: [],
  },
  registration: { open: true },
  announcement: { enabled: false, message: "" },
};

export interface StoredSettings {
  settings: Settings;
  /** Increments on every save. A save made from a stale version is refused (two admins, one screen). */
  version: number;
  updatedAt?: Date | undefined;
  updatedBy?: string | undefined;
}

export interface SettingsRepository {
  get(): Promise<StoredSettings>;
  /** Returns false when `expectedVersion` is no longer current. */
  save(settings: Settings, expectedVersion: number, by: string, at: Date): Promise<boolean>;
}

/** Fills gaps (a setting added in a later release) from the defaults, section by section. */
export function withDefaults(raw: Partial<Settings> | undefined): Settings {
  return {
    referral: {
      ...DEFAULT_SETTINGS.referral,
      ...raw?.referral,
      experiment: { ...DEFAULT_SETTINGS.referral.experiment, ...raw?.referral?.experiment },
    },
    registration: { ...DEFAULT_SETTINGS.registration, ...raw?.registration },
    announcement: { ...DEFAULT_SETTINGS.announcement, ...raw?.announcement },
  };
}
