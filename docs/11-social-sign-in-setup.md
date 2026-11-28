# 11 — Social sign-in: how to get the keys and switch each provider on

> Status: **v1.0** · 2026-11-18 · Applies to branch `feat/social-sign-in`.
> Providers: **Google, Microsoft, GitHub, Facebook, LinkedIn**. Email and password sign-in keeps working next to them.
> Console screens change often. Where a button name below no longer matches, look for the closest one and trust the
> *values* (redirect addresses, scopes), not the menu names. Items marked **verify** are the ones most likely to move.

## 1. How it works (60 seconds)

1. A visitor clicks **Sign in with Google** (or another provider). The browser goes to MDL's API, then to the provider.
2. The provider asks the person to approve sharing their **name and email** with MDL, and sends the browser back to
   MDL's API at a fixed **redirect address** (the "callback").
3. MDL checks the response, then either **signs the person in** (they have connected before), or asks two quick
   questions (age group, privacy notice) and **creates their account**.
4. A person can use **any one** method: email and password, or any connected provider. They can connect several to one
   account from **My account > Sign-in methods**.

What MDL asks each provider for: identity only (name, email, a stable user id). Nothing is posted on their behalf and
no contacts, files or pages are read.

### Rules the code enforces (so you do not have to remember them)

| Rule | Why it matters |
| --- | --- |
| A provider account is **never merged automatically** into an existing MDL account because the emails match | Stops account takeover by someone who controls a look-alike provider account |
| Linking is done only by a **signed-in** person, from their account page | Another website cannot attach its account to your visitor |
| Google, GitHub and LinkedIn emails count as verified; **Microsoft and Facebook emails do not**, so those sign-ups confirm the mailbox with an 8-digit code | Those two providers do not promise the email is verified |
| New social sign-ups still choose an **age group** and accept the privacy notice; under-16s still need a guardian | Same child-safety rule as email sign-up |
| A person can never remove their **last** way to sign in | Prevents locking oneself out |
| Provider error text is never shown or stored; people only see fixed messages | Prevents leaking details and injecting content |

## 2. What you need before starting

| Item | Detail |
| --- | --- |
| Public web address of the site | For example `https://mindsdigitallegacy.com` (called **WEB** below) |
| Public address of the API | For example `https://api.mindsdigitallegacy.com` (called **API** below). Set it as `API_PUBLIC_URL` |
| A live **privacy policy** page and **terms** page | Google, Facebook and LinkedIn ask for these. MDL already has `/privacy`; add `/terms` before going live |
| A support email on your own domain | For example `support@mindsdigitallegacy.com`. Providers show it to people |
| A square **logo** (at least 120 x 120 px; 512 x 512 is safest) | Used on every consent screen |
| The company (Organisation) account, not a personal one | Create every app under a shared organisation or a shared mailbox so it survives if one founder leaves |
| A password manager or secret store | Client secrets are shown **once**. Never paste them into chat, email, tickets or git |

### The redirect addresses (the most common cause of problems)

Every provider must be told exactly where to send people back. The address is always:

```
<API_PUBLIC_URL>/api/v1/auth/oauth/<provider>/callback
```

| Environment | `API_PUBLIC_URL` | Google | Microsoft | GitHub | Facebook | LinkedIn |
| --- | --- | --- | --- | --- | --- | --- |
| Local | `http://localhost:4000` | `.../google/callback` | `.../microsoft/callback` | `.../github/callback` | `.../facebook/callback` | `.../linkedin/callback` |
| Staging | `https://api-staging.example.rw` | same, with this host | same | same | same | same |
| Production | `https://api.mindsdigitallegacy.com` | same, with this host | same | same | same | same |

Example for Google in production: `https://api.mindsdigitallegacy.com/api/v1/auth/oauth/google/callback`

**It must match character for character**: same `https`, same host, no trailing slash, same path. Register **each**
environment you use. GitHub allows only one callback per app, so make a separate GitHub app for local, staging and
production (see section 5).

> The session cookie belongs to the API address, so the website and the API must share the same site (for example
> `mindsdigitallegacy.com` and `api.mindsdigitallegacy.com`). This is already how MDL is designed.

> **When the website forwards `/api` to the API (the Vercel + Render setup in docs/12), use the *website's* address as `API_PUBLIC_URL`** and in every provider's redirect address, for example `https://mindsdigitallegacy-sigma.vercel.app/api/v1/auth/oauth/google/callback`. The sign-in cookie then belongs to the website.

## 3. Switch it on: the settings

Set these on the **API** (never in the website). A provider appears on the site only when **both** its id and secret are set.

| Setting | Meaning | Example |
| --- | --- | --- |
| `API_PUBLIC_URL` | Public address of the API (https in production) | `https://api.mindsdigitallegacy.com` |
| `OAUTH_STATE_KEY` | Random 32+ characters. Seals the sign-in state. **Required in production** | output of `openssl rand -base64 32` |
| `OAUTH_GOOGLE_CLIENT_ID` / `_SECRET` | From section 4 | |
| `OAUTH_MICROSOFT_CLIENT_ID` / `_SECRET` | From section 6 | |
| `OAUTH_MICROSOFT_TENANT` | `common` (work, school and personal), `organizations`, `consumers`, or one tenant id | `common` |
| `OAUTH_GITHUB_CLIENT_ID` / `_SECRET` | From section 5 | |
| `OAUTH_FACEBOOK_CLIENT_ID` / `_SECRET` | The **App ID** and **App secret**, from section 7 | |
| `OAUTH_FACEBOOK_GRAPH_VERSION` | Facebook API version. Default `v25.0` | `v25.0` |
| `OAUTH_LINKEDIN_CLIENT_ID` / `_SECRET` | From section 8 | |

Rules the API checks when it starts (it refuses to start rather than run half-configured):

- an id without its secret (or the reverse) is an error;
- in production, any enabled provider also needs `OAUTH_STATE_KEY` and an `https://` `API_PUBLIC_URL`.

Local file: copy `backend/.env.example` to `backend/.env` and uncomment the lines you need. In staging and production,
inject them from your hosting platform's secret manager instead of a file.

---

## 4. Google

**Time:** about 20 minutes. **Cost:** free. **Review:** not needed for sign-in with name and email.

1. Open <https://console.cloud.google.com> and sign in with the **organisation** Google account.
2. Top bar > project picker > **New project**. Name it `MDL Sign-in`. Choose your organisation or "No organisation". **Create**, then select it.
3. Open the menu > **Google Auth Platform** (older name: *APIs & Services > OAuth consent screen*). Click **Get started**.
4. **App Information:** App name `Minds Digital Legacy`, User support email = your support address. **Next**.
5. **Audience:** choose **External** (anyone with a Google account). **Next**.
6. **Contact information:** your developer email. **Next**, accept the policy, **Create**.
7. **Branding** (left menu): upload the logo, fill **Application home page** (WEB), **Privacy policy link** (`WEB/privacy`),
   **Terms of service link**, and add your domain under **Authorized domains** (for example `mindsdigitallegacy.com`). **Save**.
8. **Data Access** (left menu) > **Add or remove scopes**. Tick only: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. **Update**, **Save**. Do **not** add any other scope.
9. **Clients** (left menu) > **Create client**:
   - **Application type:** *Web application*. **Name:** `MDL web sign-in (production)`.
   - **Authorized JavaScript origins:** leave empty (not used).
   - **Authorized redirect URIs:** **Add URI** and paste `https://<API>/api/v1/auth/oauth/google/callback`. Add the staging and `http://localhost:4000/...` versions too if you use them.
   - **Create**.
10. A dialog shows the **Client ID** and **Client secret**. Copy both into your secret store now.
    - `OAUTH_GOOGLE_CLIENT_ID` = Client ID (ends in `.apps.googleusercontent.com`)
    - `OAUTH_GOOGLE_CLIENT_SECRET` = Client secret
11. **Go live for everyone:** Google Auth Platform > **Audience** > **Publish app** (status becomes *In production*). While the app is in **Testing**, only people you add under **Test users** (up to 100) can sign in.

Good to know:

- Changes to redirect URIs can take a few minutes (rarely hours) to apply.
- Google may show an "unverified app" screen if branding or domain ownership is incomplete; finish Branding and confirm the domain in **Google Search Console**. Basic sign-in scopes do not need a security review. **(verify)**
- Create one client per environment so a leaked staging secret cannot affect production.
- Rotate: open the client > **Add secret**, deploy the new one, then **Disable** and delete the old.

## 5. GitHub

**Time:** about 5 minutes. **Cost:** free. GitHub allows **one callback address per app**: create one app per environment.

1. Sign in to GitHub as an owner of your **organisation**. Open the organisation > **Settings** > (left menu, bottom) **Developer settings** > **OAuth Apps** > **New OAuth App**.
   (A personal app also works: avatar > Settings > Developer settings. Prefer the organisation so it does not depend on one person.)
2. Fill in:
   - **Application name:** `Minds Digital Legacy` (people see this)
   - **Homepage URL:** WEB
   - **Application description:** optional, one sentence
   - **Authorization callback URL:** `https://<API>/api/v1/auth/oauth/github/callback`
   - **Enable Device Flow:** leave **off**
3. **Register application**. The page shows the **Client ID**.
4. Click **Generate a new client secret**. Copy it immediately (GitHub shows it **once**).
   - `OAUTH_GITHUB_CLIENT_ID` and `OAUTH_GITHUB_CLIENT_SECRET`
5. Optional: upload a logo and set a badge background colour.

What MDL requests: `read:user` and `user:email`. People who hide their email on GitHub still work: MDL reads their **verified primary** address through the email permission. If a person has no verified email at all, sign-up stops with "no email shared".

Good to know:

- Production and staging need **separate apps** (different callback address, different secret).
- You can revoke an app's access or reset its secret any time under the app's page.
- Rotate: **Generate a new client secret**, deploy it, then delete the old secret.

## 6. Microsoft (work, school and personal accounts)

**Time:** about 10 minutes. **Cost:** free.

1. Open <https://entra.microsoft.com> and sign in with an Azure/Microsoft 365 admin account for your organisation. No tenant yet? Create a free Azure account at <https://azure.microsoft.com/free> first; that gives you one.
2. **Entra ID** (or *Identity*) > **App registrations** > **New registration**.
3. Fill in:
   - **Name:** `Minds Digital Legacy sign-in`
   - **Supported account types:** choose **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**. This is what lets school, work **and** personal (Outlook, Hotmail) users sign in.
   - **Redirect URI:** platform **Web**, value `https://<API>/api/v1/auth/oauth/microsoft/callback`
4. **Register**. On the **Overview** page copy **Application (client) ID** = `OAUTH_MICROSOFT_CLIENT_ID`.
5. **Certificates & secrets** > **Client secrets** > **New client secret**. Description `production`, expiry **12 months** (the maximum is 24; shorter is safer). **Add**.
   Copy the **Value** column immediately = `OAUTH_MICROSOFT_CLIENT_SECRET`.
   Do **not** copy the *Secret ID*; that is a different thing.
6. **Authentication** (left menu): confirm the **Web** redirect URI is listed (add staging and `http://localhost:4000/...` versions here too). Leave the "Implicit grant" tick boxes **unticked**.
7. **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions** > tick `openid`, `profile`, `email` (and keep `User.Read`) > **Add**. No admin consent is needed for these.
8. Leave `OAUTH_MICROSOFT_TENANT=common`. To allow **only** your own organisation, set it to your **Directory (tenant) ID** (shown on the Overview page) instead.

Good to know:

- **Put the secret's expiry date in a shared calendar** (for example 2 weeks before). When it expires, Microsoft sign-in stops. Create a new secret, deploy it, delete the old one.
- Microsoft does not guarantee the email on a sign-in is verified, so MDL always asks Microsoft sign-ups to confirm the mailbox with a code. Some personal accounts return no email; those people see "no email shared".
- The consent screen says "unverified" until you complete **Branding & properties > Publisher verification** (needs a Microsoft Partner Network account). It still works without it. **(verify)**

## 7. Facebook

**Time:** about 30 minutes (plus the review of privacy and data-deletion links). **Cost:** free. Facebook has the strictest set-up.

1. Open <https://developers.facebook.com> > **Log in** with a Facebook account that is an administrator of your business (use the founders' shared business account if you have one) > **Get started** and finish developer registration.
2. **My Apps** > **Create app**.
   - **App name:** `Minds Digital Legacy`; **App contact email:** your support address.
   - **Use case:** choose **Authenticate and request data from users with Facebook Login**.
   - Link a **Business portfolio** if asked (optional for basic login). **Create app**. **(verify the wording of the use case)**
3. In the left menu, open **Use cases** > the Facebook Login use case > **Customize** (or **Facebook Login > Settings**):
   - **Client OAuth login:** **Yes**; **Web OAuth login:** **Yes**; **Enforce HTTPS:** **Yes** (production); **Use Strict Mode for redirect URIs:** **Yes**.
   - **Valid OAuth Redirect URIs:** `https://<API>/api/v1/auth/oauth/facebook/callback` (add `http://localhost:4000/...` only while developing). **Save changes**.
4. Still under the use case, **Permissions and features**: make sure **`public_profile`** and **`email`** are present (add `email` if missing). These two need no app review.
5. Left menu > **App settings** > **Basic**:
   - **App ID** = `OAUTH_FACEBOOK_CLIENT_ID`.
   - **App secret** > **Show** (re-enter your Facebook password) = `OAUTH_FACEBOOK_CLIENT_SECRET`.
   - **Privacy Policy URL:** `WEB/privacy`; **Terms of Service URL:** `WEB/terms`; **App icon:** 1024 x 1024 px.
   - **User data deletion:** choose **Data deletion instructions URL** and point to a page that explains deletion. Suggested text for that page: "Sign in to MDL, open My account, and choose Delete my account. Your data is removed after the grace period. Email support@mindsdigitallegacy.com if you cannot sign in."
   - **Category:** Education. **Save changes**.
6. **Go live:** at the top of the dashboard switch **App mode** from **Development** to **Live**. In Development mode only the people listed under **App roles** (admins, developers, testers) can sign in, which is perfect for testing first.
7. Test: add yourself under **App roles > Roles**, open the site in a private window, and try **Sign in with Facebook**.

Good to know:

- Facebook returns **no email** for people who signed up with only a phone number, or who deny the email permission. Those people see "no email shared" and can use another method.
- Facebook does not say whether the email is verified, so MDL confirms the mailbox with a code on every Facebook sign-up.
- `OAUTH_FACEBOOK_GRAPH_VERSION` defaults to `v25.0` (supported until mid-2028 according to Meta's version list at the time of writing). Meta releases a new version about every 3 to 4 months; you need to bump the setting before your version's end of life. **(verify on the changelog)**
- Rotate: **App settings > Basic > App secret > Reset**; deploy the new secret straight away (the old one stops working).

## 8. LinkedIn

**Time:** about 15 minutes. **Cost:** free. LinkedIn requires the app to belong to a **LinkedIn Company Page**.

1. Make sure your organisation has a **LinkedIn Page** and that you are one of its **super admins** (create one at <https://www.linkedin.com/company/setup/new/> if not).
2. Open <https://www.linkedin.com/developers/apps> > **Create app**.
   - **App name:** `Minds Digital Legacy`
   - **LinkedIn Page:** select your company page
   - **Privacy policy URL:** `WEB/privacy`
   - **App logo:** upload (at least 100 x 100 px)
   - Tick the legal agreement > **Create app**.
3. Page admin step: the **Settings** tab shows **Verify** next to the company. Click it, copy the **verification link**, open it as the company page admin, and approve. (Needed before some products activate.) **(verify)**
4. **Products** tab > **Sign In with LinkedIn using OpenID Connect** > **Request access** > agree. It is approved immediately and appears under "Added products". Do **not** request other products.
5. **Auth** tab:
   - **Client ID** = `OAUTH_LINKEDIN_CLIENT_ID`
   - **Primary Client Secret** (click the eye icon) = `OAUTH_LINKEDIN_CLIENT_SECRET`
   - **OAuth 2.0 settings > Authorized redirect URLs for your app** > pencil icon > **Add redirect URL** > `https://<API>/api/v1/auth/oauth/linkedin/callback` > **Update**.
   - Under **OAuth 2.0 scopes** you should see `openid`, `profile`, `email`.

Good to know:

- LinkedIn does not accept `http://localhost` callbacks reliably; for local tests with real LinkedIn keys, use an https tunnel (for example Cloudflare Tunnel) and set `API_PUBLIC_URL` to the tunnel address. **(verify)**
- Rotate: **Auth** tab > generate a new client secret if offered, or contact LinkedIn support; plan the change for a quiet hour.

---

## 9. Try it with no keys at all (local demo providers)

The in-memory development API (`cd backend && npm run dev:memory`) switches on **demo** versions of all five buttons. Clicking one skips the provider's page and signs in a fixed demo person (for example `google.demo@example.rw`).

| Demo provider | Email trusted? | What you will see |
| --- | --- | --- |
| Google, GitHub, LinkedIn | Yes | Finish page (age group, privacy notice), then signed in |
| Microsoft, Facebook | No | Finish page, then an 8-digit code. The code is **printed in the API console** (like verification links) |

Start the website with `bun run dev` in `frontend` (it talks to the API on port 4000), open **/login** or **/register**, and click a button. This is for development only; a real server never contains the demo providers.

## 10. Test checklist for each real provider

Run this once per provider, per environment, in a **private browser window**:

- [ ] The button appears on **Sign in** and **Sign up**.
- [ ] A brand-new person: provider page > approve > **Finish signing up** > lands on **My account** signed in.
- [ ] Sign out, then **Sign in with** the same provider: goes straight to **My account** (no second account created).
- [ ] An existing email-and-password learner with the same email tries the provider: sees "An account with that email already exists..." and is **not** signed in.
- [ ] That learner signs in by password, opens **My account > Sign-in methods**, clicks **Connect**: provider appears as connected. Signing out and in with the provider now opens the **same** account.
- [ ] **Disconnect** works, and refuses when it is the only way to sign in.
- [ ] Pressing **Cancel** on the provider's page returns to **Sign in** with a calm message.
- [ ] (Microsoft, Facebook) The 8-digit code arrives by email and works; a wrong code is refused.
- [ ] Under-16 choice asks for a guardian email and says the account waits for them.

## 11. Secrets: handling and rotation

| Do | Do not |
| --- | --- |
| Keep secrets in the hosting platform's secret manager | Put them in git, chat, email, tickets or screenshots |
| Use a **separate app and secret** for local, staging and production | Reuse the production secret on a laptop |
| Give each secret an owner and a **calendar reminder** (Microsoft expiry; all others yearly) | Wait for sign-in to break |
| Replace a secret straight away if it was ever pasted somewhere public | "Just keep an eye on it" |

If a secret leaks: (1) generate a new one in the provider console, (2) deploy it, (3) delete the old one, (4) check the audit log for `auth.oauth.*` events you do not recognise. Rotating `OAUTH_STATE_KEY` is harmless: people in the middle of signing in simply start again.

| Secret | Where it expires or rotates |
| --- | --- |
| Google client secret | No expiry; rotate yearly (add new, then disable old) |
| Microsoft client secret | **Expires** (12 or 24 months, your choice at creation) |
| GitHub client secret | No expiry; rotate yearly |
| Facebook app secret | No expiry; reset yearly or on suspicion |
| LinkedIn client secret | No expiry; rotate yearly |
| `OAUTH_STATE_KEY` | Rotate yearly |

## 12. Privacy and legal checklist (before going live)

- [ ] The **privacy notice** lists the sign-in providers you enable, what MDL receives from them (name, email, a provider id) and that the provider handles its own data under its own policy. Have a Rwandan lawyer review the wording (sprint plan F5).
- [ ] The notice says people can **disconnect** a provider and **delete** their account (both exist in **My account**).
- [ ] **Facebook and Google** have working privacy-policy and (Facebook) data-deletion links.
- [ ] Your data protection registration (sprint plan F3) covers collecting data through these providers.
- [ ] Decide what to do when a provider disappears (for example a person loses access to their Google account): they can still use **Forgot password** to add a password, because the email is on their MDL account.

## 13. Troubleshooting

| Symptom | Usual cause | Fix |
| --- | --- | --- |
| Button does not appear | Only one of id/secret set, a typo in the setting name, API not restarted | Set both, restart, open `GET <API>/api/v1/auth/oauth/providers` to see what is on |
| Google: `redirect_uri_mismatch` | Registered address differs from the real one | Compare character by character: `https`, host, path, no trailing slash. Wait a few minutes after editing |
| Google: "Access blocked: app not verified" or only some people can sign in | App still in **Testing** | Audience > **Publish app** |
| Microsoft: `AADSTS50011` | Redirect URI not registered as platform **Web** | Add it under **Authentication** |
| Microsoft: `AADSTS7000215` / "invalid client secret" | Used the *Secret ID* instead of the *Value*, or the secret expired | Create a new secret and copy the **Value** |
| GitHub: "The redirect_uri is not associated with this application" | Callback differs, or you used the production app locally | One app per environment |
| Facebook: "URL Blocked: This redirect failed..." | Redirect URI not in **Valid OAuth Redirect URIs**, or Strict Mode with a mismatch | Add the exact address and save |
| Facebook: only some people can sign in | App is in **Development** mode | Switch **App mode** to **Live** |
| LinkedIn: `unauthorized_scope_error` | The OpenID Connect product was not added | **Products** tab > request **Sign In with LinkedIn using OpenID Connect** |
| After the provider, "The sign-in took too long or was interrupted" (`oauth_expired`) | The browser blocked or lost the sign-in cookie; took over 10 minutes; API and website not on the same site | Retry in one go; check the site/API domains share a registrable domain |
| "We could not complete the sign-in" (`oauth_failed`) | Wrong secret, a mismatch, or the provider rejected the request | Check the API log for `auth.oauth.failure` (no secrets are logged) and re-check the keys |
| "That account did not share an email address" | Provider has no email for that person | Use another sign-in method |
| "An account with that email already exists" | Same email already registered | Sign in by password, then **Connect** the provider from My account |

The address bar after a failed trip shows a short code, for example `/login?error=oauth_failed&provider=google`.
The API records each failure as an `auth.oauth.failure` audit event with the reason code and provider, never any
secret, token or provider message.

## 14. Adding another provider later

Apple, X, Discord and others follow the same pattern. A provider is one small adapter in
`backend/src/modules/oauth/providers.ts` (an authorize address, a code exchange and a mapping to name, email and
whether the email is verified), a row in `oauth.types.ts`, four lines in `env.ts`, and an icon. The rules in section 1
apply to it automatically. Notes: **Apple** needs a paid Apple Developer account and a client secret that is itself a
signed token that must be regenerated every 6 months; **X** does not reliably return emails; both are best added after the
five here are live and measured.

## Sources

- Google Cloud documentation, *Setting up OAuth 2.0* and the Google Auth Platform console (Branding, Audience, Data Access, Clients).
- Microsoft Learn, *Register an application with the Microsoft identity platform* and the Entra admin center app registration flow.
- GitHub Docs, *Creating an OAuth app* and *Scopes for OAuth apps*.
- Meta for Developers, *Facebook Login* and the Graph API changelog (version list).
- LinkedIn Developer documentation, *Sign In with LinkedIn using OpenID Connect*.
- OpenID Connect Core 1.0 and RFC 6749 / RFC 7636 (authorization code flow, PKCE) for the protocol rules the code follows.
