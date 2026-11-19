import type { OAuthIdentity, OAuthIdentityRepository } from "../modules/oauth/oauth.repository.js";

let counter = 0;

export function memoryOAuthIdentities(): OAuthIdentityRepository & { all: OAuthIdentity[] } {
  const all: OAuthIdentity[] = [];
  return {
    all,
    findByProviderSubject: (provider, subject) =>
      Promise.resolve(all.find((i) => i.provider === provider && i.subject === subject) ?? null),
    listByUser: (userId) => Promise.resolve(all.filter((i) => i.userId === userId)),
    create(identity, now) {
      const clash = all.some(
        (i) =>
          (i.provider === identity.provider && i.subject === identity.subject) ||
          (i.provider === identity.provider && i.userId === identity.userId),
      );
      if (clash) return Promise.reject(new Error("DUPLICATE"));
      const row: OAuthIdentity = {
        ...identity,
        id: `oid${String((counter += 1))}`,
        createdAt: now,
        lastUsedAt: now,
      };
      all.push(row);
      return Promise.resolve(row);
    },
    touch(id, at) {
      const row = all.find((i) => i.id === id);
      if (row !== undefined) row.lastUsedAt = at;
      return Promise.resolve();
    },
    remove(userId, provider) {
      const i = all.findIndex((x) => x.userId === userId && x.provider === provider);
      if (i < 0) return Promise.resolve(false);
      all.splice(i, 1);
      return Promise.resolve(true);
    },
    removeAllForUser(userId) {
      let n = 0;
      for (let i = all.length - 1; i >= 0; i -= 1) {
        if (all[i]?.userId === userId) {
          all.splice(i, 1);
          n += 1;
        }
      }
      return Promise.resolve(n);
    },
  };
}

import { ProviderError } from "../modules/oauth/oauth.types.js";
import type {
  ExchangeInput,
  IdentityProfile,
  ProviderAdapter,
  ProviderId,
} from "../modules/oauth/oauth.types.js";
import { PROVIDER_LABEL } from "../modules/oauth/oauth.types.js";

/**
 * A pretend provider for tests and the local dev server. The `code` the callback receives picks which
 * identity comes back, so a test decides "who signed in" without any network. A value that is a
 * ProviderError makes the exchange fail the way a real provider can.
 */
export function fakeProvider(
  id: ProviderId,
  profiles: Record<string, Omit<IdentityProfile, "provider"> | ProviderError>,
): ProviderAdapter & {
  exchanged: ExchangeInput[];
  authorized: { state: string; nonce: string; challenge: string }[];
} {
  const exchanged: ExchangeInput[] = [];
  const authorized: { state: string; nonce: string; challenge: string }[] = [];
  return {
    id,
    label: PROVIDER_LABEL[id],
    exchanged,
    authorized,
    authorizeUrl(p) {
      authorized.push({ state: p.state, nonce: p.nonce, challenge: p.challenge });
      return `https://${id}.provider.test/authorize?${new URLSearchParams({ state: p.state, redirect_uri: p.redirectUri }).toString()}`;
    },
    exchange(input) {
      exchanged.push(input);
      const found = profiles[input.code];
      if (found === undefined)
        return Promise.reject(new ProviderError("exchange_failed", "unknown code"));
      if (found instanceof ProviderError) return Promise.reject(found);
      return Promise.resolve({ ...found, provider: id });
    },
  };
}
