# 01 — Research and Gap Analysis

> Status: **Draft v0.1** · 2026-11-13 · Owners: Enock, co-founder
> Purpose: understand the proposal, check the market and the law, find real gaps, and decide what is
> worth building first. Every design decision in `02-hld.md` onwards traces back to a finding here.

## 0. How to read this document (method and limits)

- Facts below were read from the cited pages on 2026-11-12/13. Numbers are quoted with their caveats.
- **Not verified** (treat as open items, not facts): the 2020 Rwanda Internship Guidelines (the host was
  unreachable from the research environment), the RDB company-registration fees and timelines, and
  competitor details for ALX, KLab, Rwanda Coding Academy and similar programmes (only searched, not read).
- Payment fees and timelines come from agency blog posts and are **indicative only**; confirm with MTN and
  Airtel directly.
- A web search is **not** a registry check. The name-uniqueness result in section 8 must be confirmed at RDB.
- Legal notes summarise a secondary source (DLA Piper). They are not legal advice. Have a Rwandan lawyer
  review section 6 before launch.

## 1. What the proposal asks for

MDL (*Empowering Digital Skills, Simplifying Your Daily Work*) is a technology company with four pillars:

1. **Technology Solutions**: websites, web/mobile apps, management systems, IT support, data and BI, creative services.
2. **MDL Training Academy**: practical courses (digital foundations, Office, programming, design, digital business, IT and safety).
3. **Internship and Career Development**: supervised academic and professional internships across ten departments.
4. **Corporate and Institutional Solutions**: long-term relationships with schools, health, finance, NGOs, public bodies and others.

The proposal is unusually candid, and that candour is a design requirement:

- It states it does **not** claim every service is operational (section "Document Purpose").
- Internship applications **do not guarantee placement**; interns are accepted only with a supervisor and capacity.
- MDL should "begin with services it can deliver well" and expand by stages.
- Section 20 lists facts to add before external circulation (legal name, contacts, team, portfolio, open services).

**Consequence for the platform:** it must never display capacity, placements, partners or results that are not
real. Public content is driven from data the team controls, with explicit "currently open / not open"
states, and the application flows must say "applying does not guarantee a place".

## 2. What already exists in the repository

The repo was not empty. It held a **TanStack Start (React 19) site** (originally generated with a hosted
site builder; since detached, see ADR-0007) targeting Cloudflare Workers (Bun lockfile, Tailwind, shadcn/ui). Routes already exist for home, about, academy,
internships, services, sectors, corporate, careers, partners, contact, and the MDL brand pages. The
frontend now lives in `frontend/`.

Key gap found by reading the code: **the forms do not submit anywhere** (`LeadForm` states online
submission is not connected). The marketing surface is built; the product behind it (API, accounts,
academy, referrals, internship pipeline) does not exist yet. That is the first thing to build.

Baseline health at the start of this work: `bun install --frozen-lockfile` OK, `vitest` 1/1 passing,
production build OK, ESLint reports 131 Prettier-formatting errors and 7 fast-refresh warnings but **0
non-formatting errors**. CI therefore checks lint with the formatting rule disabled until a deliberate
format-only commit is made (see ADR-0007).

## 3. Market facts for Rwanda

| # | Fact | Source / caveat |
|---|---|---|
| 1 | Only **39%** of ICT graduates meet job-market expectations; **28%** of employers cite inadequate digital skills as a major constraint. | ILO *Rwanda Digital Employment Diagnostic* (2025), exec. summary p. viii |
| 2 | Mobile data costs **10–20%** of per-capita income, against a global average of 5%. | Same, p. vii. The report uses "per capita income" in the summary and "GNI per capita" in section 4.a |
| 3 | **98.8%** of people have 4G coverage, yet only **21%** of adults used the internet in the past three months. | Same, p. vii. The 21% is attributed to the Labour Force Survey (2022 or 2023 depending on the section) |
| 4 | **64.2%** of Rwandans aged 16+ own a mobile phone and **24.8% of those** own a smartphone (about 16% of people 16+, our arithmetic). | Same, section 4.a p. 22. The summary states 24.8% without the denominator, which is easy to misread |
| 5 | Youth unemployment: 21% of teenagers and 17.2% of the working-age population unemployed. | Same, p. viii |
| 6 | 5.01M internet users (34.2% penetration); Facebook ad reach 1.35M, Instagram 576K, LinkedIn 570K, X 302K. WhatsApp, YouTube and TikTok are **not reported**. | DataReportal *Digital 2026: Rwanda*. Ad reach is not monthly active users |
| 7 | The Government's National Internship Programme places graduates for 3–6 months with a stipend, and is trying to grow ICT-enabled placements with private firms (ILO and MIFOTRA, Luxembourg-funded). It cites a mismatch between employer-needed skills and formal education, and weak soft skills. | UNGM notice 268579 (call closed June 2025; no current placement numbers published) |
| 8 | The Digital Talent Program targets **20,000 youth over two years**. It is run by IHS Towers with MINICT and the Rwanda ICT Chamber. It is free, mostly self-paced online, and gives **no** stipend, device or data allowance. | globalsouthopportunities.com summary. Dates, selection criteria and credentials are not stated |
| 9 | Foundational free courses (freeCodeCamp, Odin Project, CS50) lack mentorship, accountability and Rwandan context. Udemy and Coursera need a card. A local option (McTaba) takes MTN MoMo and Airtel Money at roughly RWF 30,000. | mctaba.com articles. A vendor's own market guide, so treat the gap claims as one view |

**Design implications**

- **Mobile-first and light.** About 16% of people 16+ own a smartphone, and data is expensive. Target low-end
  Android on 3G-class budgets: lazy-loaded video, small JS, no autoplay, offline-friendly notes.
- The audience that can actually use an online academy today is a **minority of the population**
  (internet users: 34.2%). Growth by invitation reaches that minority well, but the market ceiling is real.
- Pricing and payment for any paid product must support **MoMo**, not cards.

## 4. Competitive landscape

| Player | What it does | Where MDL cannot win | Where MDL can differ |
|---|---|---|---|
| Digital Talent Program (state-backed) | Free, self-paced, 12 tracks, 20,000 learners | Free generic content at national scale | Supervised real projects, mentoring, a path to internships and paid work |
| Free global courses (freeCodeCamp, Odin, CS50) | Free curricula | Breadth and brand | Local context, cohorts, accountability, Kinyarwanda/English support |
| Udemy / Coursera | Paid catalogues | Catalogue size | MoMo payments, price in RWF, local mentors |
| McTaba and similar local platforms | Paid, MoMo-friendly, East African focus | Existing local trust | The combined training → internship → client-project pipeline |
| Government internship programme | Stipended 3–6 month placements | Scale and stipends | MDL can be a **host** that supplies the ICT placements the programme lacks |
| Local software agencies | Build software for clients | Existing client relationships | Training and intern supply lowers delivery cost; MDL trains the client's staff |

To investigate before the pitch (not verified): ALX Rwanda, KLab, Rwanda Coding Academy, Andela-style
talent programmes, virtual work-experience platforms (for example Forage) as global reference models for
project-based experience.

## 5. Pains, gaps and the MDL response

| Pain (evidence) | Gap | MDL response | Priority |
|---|---|---|---|
| Graduates lack job-ready skills (39% meet expectations) | Courses teach theory with no supervised practice | Every course ends in a reviewed project; best learners enter supervised internships | High |
| Employers need experience; interns lack placements | Few ICT host firms (NIP is trying to recruit them) | MDL runs real client projects that interns work on under a named supervisor | High |
| Data is expensive; few smartphones | Heavy video platforms and card-only payments exclude people | YouTube facade player (loads on tap), low-JS pages, MoMo payments later | High |
| SMEs and schools run on manual processes | Cannot find a trusted, affordable builder | Fixed-scope pilots with training and maintenance bundled | Medium |
| Learners lack accountability and local mentors | Self-paced courses have high drop-off | Cohorts, a supervisor/mentor per intern, progress dashboards | Medium |
| New brand with no recognition | Needs awareness cheaply | Verified-referral unlock for free training (section 7) | High |

### Is the idea unique?

Honest answer: **no single pillar is unique**. Free training, internships and software agencies each exist.
The defensible position is the **combination with a Rwanda-specific operating model**: free-to-start
training → reviewed projects → supervised internship → real client delivery and maintenance, built for
low-data mobile use and MoMo. That is a hypothesis to validate with a pilot cohort, not a proven moat.
The biggest competitive risk is the free national programme absorbing the generic-training demand, which is
why generic courses should be a growth channel, not the main product.

## 6. Legal and compliance findings (Rwanda Law No. 058/2021, per DLA Piper)

| Topic | Finding | Effect on the build |
|---|---|---|
| Regulator and registration | National Cyber Security Authority (NCSA). Controllers and processors must register; certificate issued within 30 days | MDL must register before processing real personal data |
| **Data residency** | Personal data **must be stored in Rwanda**; storage abroad only with a valid registration certificate authorising it. Transfers abroad only in listed cases (NCSA authorisation with safeguards, consent, contract necessity) with a written contract | **Hosting decision is a legal decision** (ADR-0003). A foreign cloud database cannot be assumed lawful |
| Children | Under 16: parent or guardian consent required | The student-heavy audience makes this a day-one requirement: age gate, guardian-consent flow, and no marketing to under-16s |
| Breach | Controller notifies NCSA within **48 hours** of becoming aware; processors notify the controller within 48 hours; affected people told in writing where high risk | Incident playbook with a 48-hour clock; logging that makes detection possible |
| DPO | Required for public and private bodies and legal entities (except courts) | Appoint a data protection officer even for a small company; confirm with counsel |
| Rights | Withdraw consent, access, rectify, restrict, erase, object, **object to direct marketing** | Self-service export/delete, marketing consent kept separate from service consent |
| Penalties | Administrative fines RWF 2M–5M or 1% of prior-year global turnover (corporate); criminal offences including unlawful processing, sale, and re-identification; corporate criminal fine up to 5% of annual turnover | The cost of getting this wrong exceeds the cost of building it right |

Related obligations to confirm with counsel: the RDB company registration comes first, because partner
agreements, MoMo merchant KYC and NCSA registration all need a legal entity; the **2020 Internship
Guidelines** (host duties, stipend, agreements) must be read in full before the first intern is accepted.

### Hosting options found

- **TrAC Kigali (TransAfrica Communications)**: Tier III data centre in Kigali; colocation and "My.cloud" IaaS
  (self-provisioning, Kubernetes, stated 99.98% uptime SLA). SLA and pricing are vendor claims to confirm.
- **MongoDB Atlas** offers AWS Cape Town (`af-south-1`) but **no Rwanda region**. Using it for personal data
  requires NCSA authorisation for storage abroad. Acceptable for non-personal and synthetic data only.

## 7. The referral-gated free training idea

The founders' plan: free training, unlocked by inviting 5 or 10 people on WhatsApp, LinkedIn, X, Instagram or
Facebook. The intent is sound (cheap early awareness). Four technical and ethical facts change how to build it.

1. **A share cannot be verified.** No platform reports back that a user actually posted or messaged. A "I
   shared" button is trivially gamed. Gate on something MDL can observe: **a unique referral link and
   distinct invitees who sign up and verify their email or phone** (ADR-0002).
2. **YouTube cannot enforce the gate.** Unlisted is not private; anyone with a video ID can watch. The gate is a
   growth mechanic, not protection of content. The API will reveal video IDs only to unlocked learners, but
   leakage is accepted. Paid content later needs signed-URL video hosting (ADR-0005).
3. **The threshold may be too high.** Verified signups per invite are unknown, and 5–10 verified invitees from a
   user base that is mostly offline is a steep ask. Hypothesis to measure: lower thresholds (for example 3)
   convert better. Make the threshold configuration, and A/B test it. (Illustrative: if only 1 in 10 shares
   becomes a verified signup, 5 invitees means about 50 shares. That is an assumption, not data.)
4. **Fairness and law.** Gating can exclude the people with the least data. Provide alternative unlock paths
   (campus or community ambassador, in-person at a partner institution, or a first module free for all).
   Never ingest phone contacts; share only through the user's own share sheet or copied link; keep marketing
   consent separate; handle under-16 consent; follow each platform's anti-spam rules.

Industry guidance (GrowSurf education template) points the same way: reward a **qualifying verified action**,
ban self-referral, reverse rewards on refund or fraud, keep credits non-cash. A course-community article
(Wbcom) claims referral conversion is "high" but gives no data and sells related services, so it is not used as evidence.

## 8. Name and brand uniqueness

A web search for "Minds Digital Legacy" Rwanda returned no organisation of that name. That is **not**
confirmation. To do before printing anything: RDB name search, domain (.rw and .com), social handles
(YouTube, LinkedIn, X, Instagram, Facebook, WhatsApp Business), and a trademark check.

## 9. Payments (later sprints)

Indicative only (agency blog): MTN MoMo has a documented Open API with a sandbox, about 1.5% merchant fee and
about 3 days to onboard; Airtel Money is rated weaker on API and sandbox, about 1.6% and about 5 days.
Needs a verified merchant account (BNR/RURA rules), hence a registered company. Design for webhook delivery
plus a status-check reconciliation job so orders never stay "pending" silently.

## 10. Technology facts that drove choices

- **Node.js:** v26 is the Active LTS (to 27 Oct 2027, security to 30 Apr 2029). v24 is in maintenance (to 30
  Apr 2028), v22 to 30 Apr 2027, v20 reached end-of-life 30 Apr 2026 (endoflife.date). Target 26, support 24+.
- **YouTube embeds:** use `youtube-nocookie.com` (privacy-enhanced mode). The API terms require an HTTP
  referrer; without one playback is blocked (error 153). So **do not** set `Referrer-Policy: no-referrer`
  on pages with embeds. Age-restricted videos cannot play on third-party sites. Owners can disable embedding.
  Documentation does not say how unlisted or private videos behave in embeds, so test it.
- **Express 5** defaults to the simple query parser (no nested objects), which removes a common route to
  NoSQL-operator injection through query strings. `req.query` is read-only, which breaks several older
  sanitising middlewares, so validation is done with strict schemas instead.

## 11. Decisions requested from the founders

1. Company registration timeline (RDB), and who is the legal owner of the code and brand.
2. Is hosting in Rwanda (self-managed MongoDB) acceptable, or will you seek NCSA authorisation for a foreign region?
3. Who is the named data protection officer?
4. Starting referral threshold: 3, 5 or 10? Which alternative unlock paths are acceptable?
5. First two or three services to **actually offer** at launch (proposal stage 1).
6. Are interns paid, stipended or unpaid? This must match the Internship Guidelines.
7. Languages at launch: English plus Kinyarwanda?

## Sources

- ILO, *Rwanda Digital Employment Diagnostic* (2025): https://www.ilo.org/sites/default/files/2025-11/Rwanda%20Digital%20Employment%20Diagnostic%20report_web.pdf
- Digital Talent Program summary: https://www.globalsouthopportunities.com/2026/07/11/rwanda-2/
- DLA Piper, Rwanda data protection: https://www.dlapiperdataprotection.com/?c=RW&t=law
- DataReportal, Digital 2026 Rwanda: https://datareportal.com/reports/digital-2026-rwanda
- UNGM, National Internship Programme notice: https://www.ungm.org/Public/Notice/268579
- McTaba, learning options for Rwandans: https://mctaba.com/learn/rwanda/affordable-online-coding-courses-rwandans
- MTN/Airtel MoMo API overview (indicative): https://kolonell.com/en/blog/rwanda-mtn-airtel-momo-api-fees-kigali-2026
- MongoDB Atlas AWS regions: https://mongodb.com/docs/atlas/reference/amazon-aws/
- TrAC Kigali data centre: https://www.datacentermap.com/rwanda/kigali/trac-kigali/
- Node.js release schedule: https://endoflife.date/nodejs
- YouTube embedding help: https://support.google.com/youtube/answer/171780?hl=en-GB
- GrowSurf education referral template: https://growsurf.com/templates/education-referral-program-template/
