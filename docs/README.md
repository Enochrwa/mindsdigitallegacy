# MDL documentation

Read in this order.

| #   | Document                                                         | What it answers                                                                                                                             |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [Research and gap analysis](01-research-and-gap-analysis.md)     | What does the proposal need, what is the Rwandan market like, what is unique, what are the legal limits, and what must the founders decide? |
| 02  | [High-level design](02-hld.md)                                   | What are the parts of the system, how do they fit, and what are the main flows and risks?                                                   |
| 03  | [Low-level design](03-lld.md)                                    | Data model, API conventions, authentication, frontend and referral algorithm in implementable detail                                        |
| 04  | [Security and threat model](04-security-and-threat-model.md)     | What can go wrong, what stops it, what is verified, and what is still open                                                                  |
| 05  | [Sprint plan](05-sprint-plan.md)                                 | Verified status, calendar, founder track, launch gate, risks, and what to cut first                                                         |
| 10  | [Sprint backlog](10-sprint-backlog.md)                           | Story-level work for Sprints 4 to 7: estimates, acceptance criteria, repo review findings, growth rules                                     |
| 07  | [Data model](07-data-model.md)                                   | Data dictionary: collections, fields, lifecycles, invariants, data-quality rules                                                            |
| 08  | [Admin console, access and referrals](08-admin-and-referrals.md) | Staff roles, two-step verification, access model, referral rules, admin API                                                                 |
| 09  | [Run it locally](09-local-setup.md)                              | Clone, configure, run and click through the product on your computer                                                                        |
| 06  | [Third-party providers](06-third-party-providers.md)             | Which email, storage, hosting, database and operations services to use, free tiers, and what each means for the data-location rule          |
| ADR | [Decision records](adr/)                                         | Why the repo layout, referral, hosting, auth, video and toolchain choices were made                                                         |

Documents are drafts for the founders to challenge. Where a document says "to confirm" or "not verified",
it means exactly that. Change a decision by adding a new ADR, not by editing an accepted one.
