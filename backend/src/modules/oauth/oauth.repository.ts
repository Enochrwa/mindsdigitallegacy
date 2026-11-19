import type { ProviderId } from "./oauth.types.js";

/** A sign-in provider account linked to one MDL account. */
export interface OAuthIdentity {
  id: string;
  userId: string;
  provider: ProviderId;
  /** The provider's id for the person. Unique per provider. */
  subject: string;
  /** The email the provider showed us when it was linked. Only for display ("connected as ...") and export. */
  email?: string | undefined;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface NewIdentity {
  userId: string;
  provider: ProviderId;
  subject: string;
  email?: string | undefined;
}

export interface OAuthIdentityRepository {
  findByProviderSubject(provider: ProviderId, subject: string): Promise<OAuthIdentity | null>;
  listByUser(userId: string): Promise<OAuthIdentity[]>;
  /** Throws "DUPLICATE" when that provider account, or that provider for this user, is already linked. */
  create(identity: NewIdentity, now: Date): Promise<OAuthIdentity>;
  touch(id: string, at: Date): Promise<void>;
  /** Returns false when there was nothing to remove. */
  remove(userId: string, provider: ProviderId): Promise<boolean>;
  removeAllForUser(userId: string): Promise<number>;
}
