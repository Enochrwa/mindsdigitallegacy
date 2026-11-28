# 12 — Deployment: Render (API), Vercel (website), MongoDB, and keeping three repos in sync

> Status: **v1.0** · 2026-11-20. Your live addresses at the time of writing:
> website `https://mindsdigitallegacy-sigma.vercel.app` (Vercel) · API `https://mindsdigitallegacyserver.onrender.com` (Render).
> Repositories: `Enochrwa/mindsdigitallegacy` (monorepo, source of truth), `Enochrwa/MDLBackend` (Render), `Enochrwa/MDLFrontend` (Vercel).
> I could not reach Render or Vercel from my build environment, so the steps that need your accounts are marked **you do this**
> and everything else was verified by building and testing locally (see section 11).

## 1. How the pieces fit

```
Browser ──► Vercel: the website + a forwarder for /api/* ──► Render: the API ──► MongoDB
            https://mindsdigitallegacy-sigma.vercel.app       onrender.com
```

**The browser only ever talks to the website's address.** The website forwards every `/api/...` request to the API.
Why: the website (`vercel.app`) and the API (`onrender.com`) are different sites. A sign-in cookie set by another site is
blocked or dropped by many browsers (Safari, Brave, Chrome's privacy settings), so sign-in would work on your laptop and
fail for visitors. With the forwarder the cookie belongs to the website itself and works everywhere. It also means no
CORS trouble and sign-in providers (Google, GitHub...) send people back to the website's address.

## 2. Which mode is it? (how nothing breaks in development or production)

| Where | How it knows | What you see to confirm |
| --- | --- | --- |
| **Your laptop** (`npm run dev` / `bun run dev`) | `NODE_ENV` unset or `development`; Vite dev server | API log: `"mode":"development"`; browser console: `[mdl] mode: development; API: http://localhost:4000` |
| **CI** (GitHub Actions) | `NODE_ENV` unset | Build log: `[check-env] mode: development/ci` |
| **Vercel preview** (branches, pull requests) | `VERCEL_ENV=preview` | Build log: `[check-env] mode: vercel preview; API: proxied to ...` |
| **Vercel production** | `VERCEL_ENV=production` | Build log: `[check-env] mode: vercel production; API: proxied to https://mindsdigitallegacyserver.onrender.com` |
| **Render production** | `NODE_ENV=production` | Render log: `{"mode":"production","production":true,"msg":"starting api"}` then `api listening` with `host 0.0.0.0` |

### What changes by mode (all automatic)

| Behaviour | Development | Production |
| --- | --- | --- |
| API listening address | `127.0.0.1` (this computer only) | `0.0.0.0` (so Render can reach it) |
| Settings validation | Lenient: fills safe defaults | **Strict: the API refuses to start** if the database, encryption key or https addresses are missing |
| Session cookie | `mdl_sid`, works on http | `__Host-mdl_sid`, Secure, https only |
| Email | Printed in the API console | Real provider (`EMAIL_*`), or logged as "not sent" if none |
| Database | MongoDB or the in-memory dev server | MongoDB only |
| Sign-in providers | Demo buttons with the in-memory server | Only providers with real keys |
| API address in the browser | `VITE_API_BASE_URL=http://localhost:4000` (same site as `localhost:3000`) | empty: same-origin `/api` forwarded to Render |
| Content-Security-Policy | Report-only (watch, never block) | Report-only until you set `VITE_CSP_ENFORCE=true` (docs/10 C4) |
| Build guard | Passes with no setup | **Stops the build** if the API setting is missing or points at localhost |

## 3. Render (the API)

**Service settings** (Dashboard > your service > Settings). A ready-made `backend/render.yaml` has the same values.

| Setting | Value |
| --- | --- |
| Repository / branch | `Enochrwa/MDLBackend`, `main` |
| Runtime | Node |
| Region | Frankfurt (closest to Rwanda) |
| **Build command** | `npm ci --include=dev --ignore-scripts && npm run build` |
| **Start command** | `npm start` |
| **Health check path** | `/api/v1/health` |
| Auto-deploy | on commit |

> **Why `--include=dev`:** Render sets `NODE_ENV=production` while building, and npm then skips dev dependencies. The TypeScript
> build needs them. Without this flag the build fails with `tsc: not found`.

**Environment variables** (Settings > Environment). Items marked 🔒 are secrets: type them in Render, never in git or chat.

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `TRUST_PROXY` | `2` (Render + the website's forwarder). See section 7 to verify |
| `WEB_BASE_URL` | `https://mindsdigitallegacy-sigma.vercel.app` |
| `CORS_ORIGINS` | `https://mindsdigitallegacy-sigma.vercel.app` (exact, no trailing slash; add a custom domain here later, comma separated) |
| `API_PUBLIC_URL` | `https://mindsdigitallegacy-sigma.vercel.app` (the **website** address: sign-in providers send people back through it) |
| 🔒 `MONGODB_URI` | Your MongoDB connection string |
| 🔒 `TOTP_ENCRYPTION_KEY` | 32+ random characters: `openssl rand -base64 32`. Losing it forces every staff member to reset two-step verification |
| 🔒 `OAUTH_STATE_KEY` | 32+ random characters, needed once any sign-in provider is on |
| `EMAIL_PROVIDER`, 🔒 `EMAIL_API_KEY`, `EMAIL_FROM` | See docs/06. Without them no email is sent (verification links will not arrive) |
| `OAUTH_*` | Provider keys, see docs/11 |

Do **not** set `PORT` (Render provides it) or `HOST` (defaults correctly in production).

**MongoDB notes**

- Atlas: Network Access must allow Render. Render's outgoing addresses change on the free plan, so use `0.0.0.0/0` together with a strong database user password, or Render's paid static outbound addresses.
- The MongoDB cluster you use for *testing* is fine for test data only. **Real learner data must be stored in Rwanda** until the lawyer-approved decision in ADR-0003 says otherwise (launch gate in docs/05).
- First time only, from the Render **Shell**: `npm run seed:academy` (loads the courses) and then `npm run admin:grant -- you@yourmail.com` (first admin). Both read `MONGODB_URI` from the environment.

**Free plan:** the service sleeps after 15 minutes idle, so the first visit afterwards takes up to a minute. Fine for testing; use a paid plan before launch.

## 4. Vercel (the website)

**Project settings** (Project > Settings):

| Setting | Value |
| --- | --- |
| Git repository / branch | `Enochrwa/MDLFrontend`, `main` |
| Framework preset | **Other** (the committed `vercel.json` also sets `"framework": null`) |
| Root directory | empty (the repository root *is* the website) |
| Install / Build commands | Leave empty: `vercel.json` sets them (installs with the pinned Bun, builds with `npm run build`) |
| Output directory | **empty** (delete any old `.output/public` override: the build now produces Vercel's own output) |

**Environment variables** (Settings > Environment Variables). Tick **Production AND Preview** for the first one:

| Key | Value |
| --- | --- |
| `API_PROXY_TARGET` | `https://mindsdigitallegacyserver.onrender.com` (https, no trailing slash, no path) |
| `VITE_API_BASE_URL` | **leave unset** (setting both stops the build on purpose) |
| `VITE_CSP_ENFORCE` | leave unset until you have reviewed a week of CSP reports |

After saving, **Redeploy** without the build cache.

**Preview deployments** (every branch): they build, but sign-in on a preview address is refused by the API because that address is not in `CORS_ORIGINS`. Test sign-in on the production address, or add one specific preview address to `CORS_ORIGINS` temporarily.

## 5. Smoke test (5 minutes, after both are deployed)

1. `https://mindsdigitallegacyserver.onrender.com/api/v1/health` shows `{"status":"ok"}` (wait a minute if it was asleep).
2. `https://mindsdigitallegacyserver.onrender.com/api/v1/ready` shows ready (database connected). A 503 means `MONGODB_URI` or Atlas access is wrong.
3. **Through the website:** `https://mindsdigitallegacy-sigma.vercel.app/api/v1/health` shows the same. This proves the forwarder works.
4. Open the website. Home, `/courses` and `/internships` load. View source shows full HTML (server rendering works).
5. Register with a real email, confirm the verification email arrives, sign in. In browser developer tools > Application > Cookies, the cookie **`__Host-mdl_sid`** exists **on the vercel.app address**, with Secure and HttpOnly ticked.
6. Sign out and in again; refresh the page: you stay signed in.
7. Admin: sign in, open `/admin`, complete the two-step setup.

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every Vercel page is **404** | Old config: the Cloudflare build output has no `index.html`, and `outputDirectory` pointed at it | Use this branch's `vercel.json` and `vite.config.ts`; clear the Output Directory override; redeploy |
| Vercel build: `lockfile ... out of sync` / `npm ci` error | A stale `package-lock.json` | Deleted by this sync; `vercel.json` installs with Bun and `bun.lock` |
| Vercel build stops with `[check-env] ERROR` | The guard doing its job | Read the line: it names the missing or wrong setting (usually `API_PROXY_TARGET` not set for Production/Preview) |
| Site loads but everything says "could not load" | `/api` is not forwarded (404) | `API_PROXY_TARGET` missing at build time; set it and redeploy |
| Render: "no open ports detected" | API listening on `127.0.0.1` | Fixed in code (defaults to `0.0.0.0` in production). Do not set `HOST=127.0.0.1` |
| Render build: `tsc: not found` | Dev dependencies skipped | Build command must contain `--include=dev` |
| Render log: `Invalid environment ...` | The strict production check | The message names the setting (database, key, https addresses) |
| Render log: `Failed to start: ... ECONNREFUSED` / `Server selection timed out` | Database unreachable | Check `MONGODB_URI`, Atlas user and Network Access |
| Sign-in works on one device, not others | The API is called directly from another site (`VITE_API_BASE_URL` set) | Remove it; use `API_PROXY_TARGET` |
| Sign-in shows "not allowed" (403) | The page's address is not in `CORS_ORIGINS` (custom domain, or a preview address) | Add the exact origin, redeploy the API |
| Everyone hits "too many requests" together | `TRUST_PROXY` too low: all visitors look like one address | Set `TRUST_PROXY=2`, see section 7 |
| First request after quiet is very slow | Render free plan sleeping | Paid plan, or accept for testing |
| No emails arrive | No `EMAIL_*` configured | docs/06; check the Render log for `email not sent` |
| Sign-in provider: `redirect_uri_mismatch` | Provider registered with the Render address | Register `https://mindsdigitallegacy-sigma.vercel.app/api/v1/auth/oauth/<provider>/callback` (docs/11) |

## 7. Verify `TRUST_PROXY` (one minute)

Rate limits and the audit log need each visitor's real address. Two proxies sit in front of the API (Vercel's forwarder, then Render),
so `TRUST_PROXY=2`. To confirm: sign in on the website, open **Admin > Audit log**, and check that the sign-in row's address prefix
is **your own network**, not Vercel's or Render's. If it shows a Vercel or Render address, increase `TRUST_PROXY` by one; if it shows
something that is not yours and can be changed by a header, lower it by one. If the API logs the warning `TRUST_PROXY is 0 in production`,
set it.

## 8. Keeping the three repositories in sync

**The monorepo is the only place you edit.** `MDLBackend` is an exact copy of `backend/` and `MDLFrontend` an exact copy of `frontend/`.
Edits made directly in a deployment repository are overwritten by the next sync.

| Tool | What it does |
| --- | --- |
| `scripts/sync-deploy-repos.sh --check` | Compares both repositories with the monorepo at the current commit. Exit 1 and a list of differences if they are not identical. Changes nothing |
| `scripts/sync-deploy-repos.sh --push` | Copies the tracked files of `backend/` and `frontend/` into the two repositories and pushes (branch `main` by default; `--branch NAME` for a branch) |
| `.github/workflows/sync-deploy-repos.yml` | Runs `--push` then `--check` automatically whenever `backend/` or `frontend/` changes on `main` |

**One-time setup for the automatic sync (you do this):**

1. GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens** > Generate. Resource owner: you. Repository access: **only** `MDLBackend` and `MDLFrontend`. Permissions: **Contents: Read and write**. Short expiry (90 days) with a reminder.
2. In `Enochrwa/mindsdigitallegacy`: Settings > Secrets and variables > Actions > **New repository secret** named `DEPLOY_SYNC_TOKEN`, paste the token.
3. Run the workflow once (Actions > *Sync deployment repositories* > Run workflow) and confirm both repositories show a commit "sync from monorepo ...".

Until the secret exists the workflow only shows a warning. Because the sync pushes to `main`, **Render and Vercel redeploy automatically after every merge to the monorepo `main`**.

## 9. Release routine

1. Work on a branch in the monorepo, open a pull request, wait for CI (and the Vercel preview built from the synced branch if you use one).
2. Merge to `main`. The sync workflow updates `MDLBackend` and `MDLFrontend`; Render and Vercel redeploy.
3. Run the smoke test in section 5.
4. **Rollback:** Render > Deploys > pick the previous deploy > *Rollback*. Vercel > Deployments > previous > *Promote to Production*. Then fix forward in the monorepo.

## 10. Secrets that must never be in git, chat or tickets

`MONGODB_URI`, `TOTP_ENCRYPTION_KEY`, `OAUTH_STATE_KEY`, `EMAIL_API_KEY`, all `OAUTH_*_SECRET`, `DEPLOY_SYNC_TOKEN`. If any was pasted anywhere
public, rotate it now (docs/11 section 11 has the order for sign-in keys; for the database, change the user's password in Atlas then update Render).

## 11. What was verified here, and what was not

Verified by building and testing in my environment:

- The backend builds with `npm ci --include=dev --ignore-scripts && npm run build`, and the built server starts. In production mode it listens on `0.0.0.0`, logs its mode, and fails fast and clearly when the database is unreachable (tests in `env.production.test.ts`).
- The frontend builds as Vercel would (`VERCEL=1`): static files, a server-rendering function and a route forwarding `/api/*` to the API. A build with the API setting missing, or pointing at localhost, is stopped with a clear message (tests in `deploy-check.test.ts`).
- The sync tool reports exactly the differences between the monorepo and each deployment repository.

**Not verified (I cannot reach your Render or Vercel accounts):** the live behaviour of the forwarder and cookies in your browser, the `TRUST_PROXY` value for Vercel's forwarded headers, that Bun installs from `npx` inside Vercel's build image, and Render's behaviour with `NODE_VERSION=24`. Section 5 and section 7 are the checks for these; if one fails, the troubleshooting table says what to change.
