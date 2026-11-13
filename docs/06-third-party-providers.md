# 06 — Third-party providers

> Status: **Draft v0.1** · 2026-11-13. Free tiers change often. Each figure below says how it was checked.
> **Verified** = read from the provider's own page or a named source on 2026-11-13. **Not re-checked** = general
> knowledge; confirm on the provider's site before relying on it.
> Every provider that stores or processes personal data outside Rwanda is subject to ADR-0003 (Law 058/2021:
> personal data must be stored in Rwanda unless authorised). Decide that first; it changes the hosting rows.

## 1. Recommended starting stack (all with a free tier)

| Need                                                  | First choice                                                                                                                                             | Why                                                                 | Cost to start                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------- |
| Transactional email (verify, reset, guardian consent) | **Brevo** free, **Resend** as the alternative                                                                                                            | See section 2                                                       | 0                            |
| Web app hosting (frontend)                            | **Cloudflare Workers/Pages**                                                                                                                             | The frontend already builds for it                                  | 0                            |
| API hosting (backend)                                 | **A small VPS** (section 4). Free web-service tiers are not suitable for production                                                                      | The API is a long-running Node server, not a Worker                 | about 10 to 20 USD per month |
| Database                                              | **MongoDB Atlas Free** for development and the pilot only; a self-managed MongoDB on the VPS or a Rwanda-hosted database once real personal data arrives | Atlas has no Rwanda region and no private endpoint on the free tier | 0 to start                   |
| Object storage and backups                            | **Cloudflare R2**                                                                                                                                        | Free egress, S3-compatible                                          | 0 within the free tier       |
| DNS, TLS, CDN, basic WAF                              | **Cloudflare** (free plan)                                                                                                                               | Already in the architecture                                         | 0                            |
| Video                                                 | **YouTube** (ADR-0005)                                                                                                                                   | Already decided                                                     | 0                            |
| Breached-password check                               | **Have I Been Pwned range API**                                                                                                                          | Used by the backend now; no key, no cost                            | 0                            |
| Uptime and error alerts                               | See section 6                                                                                                                                            | Needed before launch (launch gate)                                  | 0                            |

## 2. Email (you asked for free providers)

The API needs to send to any address, from your own domain, with SPF, DKIM and DMARC set up. Volume at launch is
small: one verification mail per registration, plus resets and guardian confirmations.

| Provider              | Free tier                                                                                                  | Checked                                                                                                                                         | Notes                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brevo**             | 300 emails per day, no time limit, no card. Full API access, webhooks, templates included on the free plan | **Verified** (brevo.com/features/email-api)                                                                                                     | The page does not say whether SMTP relay, a custom sender domain, or the Brevo footer apply on free. Confirm all three when you create the account. French company (EU data processing) |
| **Resend**            | 3,000 emails per month, 1 custom domain, API access                                                        | **Verified with limited confidence** (CostBench, 2026-11-13; Resend's own pricing page could not be fetched). A per-day cap is not stated there | Simple REST API, good developer experience. Webhooks are paid only on that source. US company                                                                                           |
| Amazon SES            | Low per-message price; free allowance depends on how you start                                             | Not re-checked                                                                                                                                  | Cheap at scale, more setup                                                                                                                                                              |
| Gmail or Outlook SMTP | Technically possible                                                                                       | n/a                                                                                                                                             | **Do not use** for a company: low limits, poor deliverability, account suspension risk, and it ties the company to a personal account                                                   |

**Recommendation:** start with Brevo (the daily limit suits bursts, which free-training launches create) and keep
the mailer behind the `Mailer` port so switching to Resend or SES is one file. Plan for 300 per day: a launch
campaign that registers more than about 250 people in a day will queue or fail, so the referral and
registration flow must tolerate delayed mail.

**What you must do whichever you pick** (these are DNS and account tasks, not code):

1. Buy or confirm the domain (company name, brand). Check the `.rw` registry (RICTA) requirements yourself.
2. Add the provider's SPF and DKIM records, then a DMARC record starting at `p=none`, moving to `quarantine`
   after a clean month.
3. Use a dedicated sender such as `no-reply@yourdomain` and a monitored `support@` address.
4. Test delivery to the mailbox providers your learners use (Gmail, Outlook, MTN and Airtel-linked, and
   institutional addresses). Spam-folder placement is the main risk, and free shared IPs are sometimes weaker.
5. Add the provider to the privacy notice as a processor, and confirm where it stores data (ADR-0003).

## 3. Storage management

The MVP stores **no user uploads** (threat X2) and videos live on YouTube, so storage needs are small:
database backups, later certificates (PDF), course attachments, and admin exports.

| Option                                     | Free tier                                                                                                                   | Checked                                             | Use                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| **Cloudflare R2**                          | 10 GB-month storage, 1 million Class A and 10 million Class B operations per month, **free egress** (Standard storage only) | **Verified** (developers.cloudflare.com/r2/pricing) | Database backups, certificates, attachments |
| Backblaze B2, AWS S3, Google Cloud Storage | Free allowances exist but differ                                                                                            | Not re-checked                                      | Alternatives if R2 is not acceptable        |
| A bucket or disk on the Rwanda-hosted VPS  | Part of the VPS price                                                                                                       | n/a                                                 | The simplest way to keep backups in Rwanda  |

**Rules whichever you choose:** private buckets only; time-limited signed links for downloads; encrypt backups
before upload; keep at least one backup copy in a different account; **do a restore test before launch**
(launch gate). Backups contain personal data, so the location rule applies to them too.

## 4. Hosting

The frontend and the API need different homes.

**Frontend:** `frontend/` builds with the Cloudflare module preset (ADR-0007). Cloudflare Workers/Pages free tier:
100,000 Worker requests per day, 10 ms CPU per request, 500 Pages builds per month, unlimited static requests;
beyond the daily cap requests fail until midnight UTC (**verified**, flaviocopes.com hosting free-tier comparison,
checked September 2026). The site is mostly static and server-rendered pages, so this fits the start. No commercial-use
restriction was stated.

**API:** the backend is a normal long-running Node server (Express), so it cannot run on Workers without a rewrite.

| Option                                | Free allowance                                                                                                                                       | Checked                         | Verdict                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A VPS** (for example Africloud VM1) | None free. Listed at 20 USD per month, 10 USD with a promo code that the page says applies to renewals. 1 vCPU, 1 GB RAM, 20 GB NVMe                 | **Verified** (africloud.com/rw) | **Recommended for production.** Note: that page says Rwanda is served from **Johannesburg**, not Kigali, so it does **not** by itself satisfy the in-Rwanda storage rule |
| Render free web service               | 750 instance hours per month, sleeps after 15 idle minutes (about a minute to wake), ephemeral disk. Render's own docs advise against production use | **Verified** (flaviocopes.com)  | Fine for a demo. **Not** for production: cold starts break email links and logins                                                                                        |
| Railway                               | 30-day trial with 5 USD one-time credit, then 1 USD of usage per month                                                                               | **Verified** (flaviocopes.com)  | Too small to run an API                                                                                                                                                  |
| Fly.io                                | No ongoing free allowance; a card is required                                                                                                        | **Verified** (flaviocopes.com)  | Not free                                                                                                                                                                 |
| Vercel Hobby                          | Personal, non-commercial use only                                                                                                                    | **Verified** (flaviocopes.com)  | **Not allowed** for a company site                                                                                                                                       |
| Netlify Free                          | 300 credits per month, hard cap, one member                                                                                                          | **Verified** (flaviocopes.com)  | Possible for the frontend; the cap pauses all projects                                                                                                                   |
| Oracle Cloud always-free, others      | Exists                                                                                                                                               | **Not re-checked**              | Evaluate separately; confirm terms for commercial use                                                                                                                    |

**Rwanda data centres:** search results indicate Africa Data Centres planned a Kigali facility (announced 2022); I
did not confirm it is operating or what hosting products exist there. Ask local providers directly (and RURA-licensed
ISPs) for VPS and managed database offers hosted in Kigali. If none suits, ADR-0003 needs the cross-border
authorisation route.

## 5. Database

| Option                                       | Free tier                                                                                                                                                                                                                                                                                | Checked                                                | Fit                                                                                                                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MongoDB Atlas Free**                       | 0.5 GB storage, max 500 connections, 100 operations per second, 10 GB in and 10 GB out per rolling week, daily snapshot with up to four retained (if enabled), pauses after 30 days with no connections, no private endpoints, no network peering, no database auditing, no log download | **Verified** (MongoDB Atlas docs, free cluster limits) | Good for development, CI and a **synthetic-data** pilot. **Not** for real learner data: no Rwanda region (regions are AWS, Google Cloud and Azure only; I could not confirm any African free region), and it lacks private networking and auditing |
| Self-managed MongoDB on the VPS              | Included in the VPS price                                                                                                                                                                                                                                                                | n/a                                                    | Needs you to run backups, patching, TLS and auth. The `docker-compose.yml` is a starting point. Keep it off the public internet                                                                                                                    |
| Managed MongoDB-compatible service in Rwanda | Unknown                                                                                                                                                                                                                                                                                  | Not researched                                         | Ask local providers                                                                                                                                                                                                                                |

The API uses plain MongoDB through Mongoose, so moving between these needs only a new `MONGODB_URI`.

## 6. Operations: DNS, security edge, monitoring

| Need                                    | Option                                                                                                                   | Checked                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| DNS, TLS, CDN, rate limiting, basic WAF | Cloudflare free plan                                                                                                     | Not re-checked in detail; confirm which WAF and rate-limit rules the free plan includes |
| Uptime alerts                           | UptimeRobot, Better Stack, or similar free monitors                                                                      | Not re-checked                                                                          |
| Error tracking                          | Sentry free developer plan, or self-hosted GlitchTip                                                                     | Not re-checked. Strip personal data before sending (the API already redacts logs)       |
| Logs                                    | The VPS journal plus a shipped copy; keep logs in Rwanda if they contain identifiers                                     | n/a                                                                                     |
| Secrets                                 | GitHub Actions secrets for CI; a `.env` file with strict permissions or the host's secret store for the server           | n/a                                                                                     |
| Web analytics                           | Cloudflare Web Analytics or a self-hosted cookieless tool; avoid analytics that need a consent banner you have not built | Not re-checked                                                                          |

## 7. Later (not needed for Sprint 1)

| Need                           | Candidates                                       | Notes                                                                             |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Mobile money payments          | MTN MoMo API, Airtel Money API, or an aggregator | Needs a registered company and business accounts. Not researched in this document |
| SMS verification and reminders | A local SMS gateway or an international API      | Cost per message; not free                                                        |
| WhatsApp reminders             | WhatsApp Business Platform                       | Opt-in required; costs apply                                                      |
| Certificates verification page | Your own API and R2                              | No third party needed                                                             |
| Transcripts and captions       | YouTube auto-captions plus manual correction     | Free                                                                              |

## 8. Decisions this document needs from you

1. **Email:** Brevo or Resend (or both: one primary, one fallback).
2. **Domain:** which name, and who owns the registrar account (use a company email, not a personal one).
3. **Where the first real learner data will live** (ADR-0003). Until this is decided, use synthetic data on Atlas
   Free and do not collect real registrations.
4. **API host:** a Kigali-hosted VPS if you can find one, otherwise a Johannesburg VPS plus the authorisation route.
5. **Budget line:** roughly one VPS plus a domain is the real minimum monthly cost once you go live. Everything
   else in section 1 can stay on free tiers at the start.

## 9. Sources

- Brevo email API and free plan: <https://www.brevo.com/features/email-api/>
- Resend free plan summary (third party, limited confidence): <https://costbench.com/software/email-api/resend/free-plan/>
- Cloudflare R2 pricing: <https://developers.cloudflare.com/r2/pricing/>
- MongoDB Atlas free cluster limits: <https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/>
- Hosting free-tier comparison (checked September 2026): <https://flaviocopes.com/hosting-free-tiers/>
- Africloud Rwanda page: <https://africloud.com/rw>
- Rwanda data localisation summary: <https://digitalpolicyalert.org/change/12074-data-localisation-requirement-in-law-no-0582021-relating-to-the-protection-of-personal-data-and-privacy>
