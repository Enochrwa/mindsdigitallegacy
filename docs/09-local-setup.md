# Run and test MDL on your computer

This guide takes you from `git clone` to a working copy you can click through. Pick a path:

| Path                              | You need                           | Data survives restart? | Best for                                       |
| --------------------------------- | ---------------------------------- | ---------------------- | ---------------------------------------------- |
| **A. Quick trial (no database)**  | Node, Bun                          | No, everything resets  | Seeing the whole product in 5 minutes          |
| **B. Full local stack (MongoDB)** | Node, Bun, Docker (or any MongoDB) | Yes                    | Realistic testing, trying the first-admin step |

Start with **A**. Move to **B** when you want to see real persistence.

## 0. Install the tools once

| Tool    | Version                          | Check           | Get it                                   |
| ------- | -------------------------------- | --------------- | ---------------------------------------- |
| Git     | any recent                       | `git --version` | https://git-scm.com                      |
| Node.js | 24 or newer (26 LTS recommended) | `node -v`       | https://nodejs.org (or `nvm install 26`) |
| Bun     | 1.x (runs the website)           | `bun -v`        | https://bun.sh                           |
| Docker  | only for path B                  | `docker -v`     | https://docs.docker.com/get-docker/      |

## 1. Get the code

```bash
git clone https://github.com/Enochrwa/mindsdigitallegacy.git
cd mindsdigitallegacy

```

The project has two parts that run side by side: `backend/` (the API, port **4000**) and `frontend/` (the website, port **8080**). Use two terminal windows.

## 2. Path A: quick trial, no database

**Terminal 1, API**

```bash
cd backend
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm ci
npm run dev:memory
```

Wait for the lines `DEV ADMIN seeded` and `IN-MEMORY DEV API`. The first one shows the admin login and a secret (see section 4.3). Check it: open http://localhost:4000/api/v1/health, which should show an "ok" status.

**Terminal 2, website**

```bash
cd frontend
cp .env.example .env
bun install
bun run dev
```

Open **http://localhost:8080**.

Everything lives in memory: stop and start the API and all accounts vanish (the dev admin is re-created). No emails are sent; links appear in Terminal 1 (section 3).

## 3. Path B: with a real MongoDB

1. In `backend/.env`, make sure `MONGO_USER` and `MONGO_PASSWORD` are set (the defaults work for local use) and that `MONGODB_URI` matches them.
2. Start the database and the API:

```bash
cd backend
docker compose up -d mongo
npm ci
npm run seed:academy        # loads the sample courses (safe to repeat)
npm run dev
```

Use `npm run dev` instead of `npm run dev:memory`. No Docker? Install MongoDB Community yourself and set `MONGODB_URI=mongodb://127.0.0.1:27017/mdl`, or use a free MongoDB Atlas cluster (test data only).

3. Start the website exactly as in path A (Terminal 2).

## 4. Try the product: a guided tour

### Email links (verification, password reset)

With `EMAIL_PROVIDER=log` nothing is emailed. Look in the **API terminal** for a line containing `"link":"http://localhost:8080/verify-email?token=..."` and open that link in your browser.

### 4.1 Learner journey

1. Open http://localhost:8080/register and create an account (password 10+ characters, tick consent).
2. Open the verification link from the API terminal. Then sign in at `/login`.
3. Browse **Courses**, open a course and start a lesson. Open courses can be started straight away.

### 4.2 Referral loop (the free-training unlock)

1. As learner 1, open **My account, Invite friends** (`/invite`). Copy your invite link (it looks like `http://localhost:8080/r/ABCD2345`).
2. Open that link in a **private/incognito window**. Create account "friend 1", then open its verification link from the API terminal.
3. Repeat with two more different emails. Real, distinct addresses are needed: the same mailbox with `+tags`, disposable domains such as `mailinator.com`, and your own other accounts do **not** count.
4. Refresh `/invite` as learner 1: the meter moves to "3 of 3" and training unlocks.
5. Unlock codes: create one in the admin console (section 4.3), then enter it on `/invite`.

### 4.3 Admin console

**Path A:** sign in at `/login` as `admin@example.rw` with password `correct horse battery`. The API terminal prints the **DEV ADMIN** secret. Add that secret to an authenticator app (Google Authenticator, Authy, 1Password: choose "enter a setup key", type: time-based), or generate codes with any TOTP tool. Then open **http://localhost:8080/admin** and enter the 6-digit code.

**Path B:** there is no seeded admin, on purpose. Make yourself one:

1. Register and verify your own account in the website (section 4.1).
2. In `backend/` run: `npm run admin:grant -- you@example.com`
3. Sign in, open `/admin`. The console makes you set up two-step verification (scan the key with an authenticator app) and shows **10 recovery codes once**. Save them.

What to try in the console:

- **Overview:** sign-ups, referral funnel, courses.
- **Courses:** edit a course, add a section and a lesson (paste a YouTube link, e.g. `https://youtu.be/dQw4w9WgXcQ`), publish and unpublish.
- **Leads:** submit the contact form on the public site, then see it appear; change status, add a note, set a follow-up date, export CSV.
- **Referrals / Unlock codes:** review held referrals, create a partner code.
- **Settings:** change the referral threshold, turn on the announcement banner (shows at the top of every page), pause registration.
- **Users:** suspend, change roles, grant access. **Audit log:** every change is recorded.

## 5. Run the automated checks

```bash
cd backend  && npm run check        # typecheck, lint, formatting, ~210 tests (no database needed)
cd frontend && bunx tsc --noEmit && bun run lint && bun run test && bun run build
```

Expected: no errors (the website lint shows 7 known warnings).

## 6. Configuration reference

All settings are documented line by line in `backend/.env.example` and `frontend/.env.example`. The ones you are most likely to touch:

| Setting                                           | Why                                               |
| ------------------------------------------------- | ------------------------------------------------- |
| `MONGODB_URI`                                     | Which database (path B)                           |
| `CORS_ORIGINS`, `WEB_BASE_URL`                    | Must match the address you open the website on    |
| `RATE_LIMIT_AUTH_PER_15MIN`                       | Raise while testing many accounts                 |
| `PASSWORD_BREACH_CHECK=false`                     | When offline                                      |
| `EMAIL_PROVIDER` + `EMAIL_API_KEY` + `EMAIL_FROM` | Real emails (docs/06-third-party-providers.md)    |
| `TOTP_ENCRYPTION_KEY`                             | Required in production: `openssl rand -base64 32` |
| `VITE_API_BASE_URL` (frontend)                    | Where the website finds the API                   |

## 7. Troubleshooting

| Symptom                                                                | Fix                                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Website loads but sign-in or data fails, browser console mentions CORS | `CORS_ORIGINS` in `backend/.env` must include the exact address in your browser bar (`http://localhost:8080`). Restart the API after editing |
| "Too many requests"                                                    | Wait 15 minutes, restart the API (path A), or raise `RATE_LIMIT_AUTH_PER_15MIN`                                                              |
| Port already in use                                                    | Another app uses 4000 or 8080. Change `PORT` (and `VITE_API_BASE_URL`) or stop the other app                                                 |
| `/api/v1/ready` returns 503                                            | The API cannot reach MongoDB: is `docker compose ps` healthy, does `MONGODB_URI` match `MONGO_PASSWORD`?                                     |
| Courses list is empty (path B)                                         | Run `npm run seed:academy`                                                                                                                   |
| Verification email never arrives                                       | Expected locally: read the link from the API terminal                                                                                        |
| Admin says "set up two-step verification" or "enter your code"         | Expected. Codes must be fresh: check your phone's clock is correct                                                                           |
| Admin code "already used"                                              | Each code works once. Wait for the next 30-second code                                                                                       |
| Lost authenticator                                                     | Use a recovery code; or another admin resets it in Users; or (path B) ask whoever runs the database                                          |
| Header logo looks broken                                               | Known: the logo image asset is not in the repo yet                                                                                           |
| `bun install` slow or refuses a package                                | The project delays brand-new package versions by 24 hours on purpose (supply-chain safety)                                                   |
| Started the API with `NODE_ENV=production` and it exits                | Production requires the extra settings listed at the bottom of `.env.example`                                                                |

## 8. Safety notes for testing

- Never commit `.env`. It is git-ignored; keep it that way.
- The path A admin account and secret are for local use only. They do not exist in production builds.
- Do not use real learners' personal data in a local or Atlas test database.
