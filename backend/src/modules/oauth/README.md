# Social sign-in module

Sign in and sign up with Google, Microsoft, GitHub, Facebook or LinkedIn, next to email and password.
How to obtain the keys: [`docs/11-social-sign-in-setup.md`](../../../../docs/11-social-sign-in-setup.md).

## Files

| File                                              | Job                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `oauth.types.ts`                                  | Provider ids, the identity shape, the adapter interface, `ProviderError`                              |
| `providers.ts`                                    | The five adapters (authorize address, code exchange, profile mapping). Enabled only when keys are set |
| `oidc.ts`                                         | id_token verification (signature against the provider's keys, audience, expiry, nonce) with `jose`    |
| `seal.ts`                                         | AES-256-GCM sealed cookies for the sign-in state and the half-finished sign-up                        |
| `oauth.service.ts`                                | The flow and its safety rules (state, linking, no email merge, mailbox code, under-16s)               |
| `oauth.routes.ts`                                 | `/api/v1/auth/oauth/...`                                                                              |
| `oauth.repository.ts` / `.model.ts` / `.mongo.ts` | Linked provider accounts. Unique `(provider, subject)` and `(userId, provider)`                       |
| `oauth.config.ts`                                 | Maps environment settings to enabled providers                                                        |

## Routes

| Method and path                                   | Who                     | Purpose                                                                              |
| ------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `GET /providers`                                  | public                  | Which buttons to show                                                                |
| `GET /:provider/start?next=`                      | public                  | Redirects to the provider, sets the sealed state cookie                              |
| `GET /:provider/callback`                         | the provider's redirect | Verifies, then signs in, links, or starts a sign-up. Always redirects to the website |
| `GET /pending`                                    | cookie                  | Who is finishing a sign-up                                                           |
| `POST /complete`                                  | cookie + header         | Age group and consent; creates the account (or mails a code)                         |
| `POST /confirm-code`                              | cookie + header         | Mailbox code for Microsoft and Facebook                                              |
| `POST /:provider/link`                            | signed in + header      | Starts linking; returns the provider address                                         |
| `GET /identities`, `DELETE /identities/:provider` | signed in               | List and disconnect                                                                  |

## Safety rules, and where they are tested (`oauth.test.ts`, `providers.test.ts`, `seal.test.ts`)

1. State sealed in the visitor's own cookie (10 min): forged, missing, tampered, expired and wrong-provider callbacks are refused.
2. PKCE for Google and Microsoft; nonce checked on every id_token; unsigned or wrong-key tokens rejected.
3. Identity is the provider's id, never the email.
4. No automatic merge into an existing account with the same email; linking only by the signed-in person, started by a POST.
5. Mailbox proof (8-digit code derived from the sealed sign-up, nothing stored) for providers that do not vouch for the email.
6. Age group, consent and guardian rules apply to social sign-ups; the account waits for the guardian.
7. A social-only account has an empty password hash and can never pass a password check (verified against a dummy hash for equal timing).
8. The last sign-in method cannot be removed; deletion without a password needs the typed email.
9. Only fixed error codes are shown; provider text and secrets are never logged.
