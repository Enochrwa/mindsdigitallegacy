# MDL documentation

Read in this order.

| #   | Document                                                     | What it answers                                                                                                                             |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [Research and gap analysis](01-research-and-gap-analysis.md) | What does the proposal need, what is the Rwandan market like, what is unique, what are the legal limits, and what must the founders decide? |
| 02  | [High-level design](02-hld.md)                               | What are the parts of the system, how do they fit, and what are the main flows and risks?                                                   |
| 03  | [Low-level design](03-lld.md)                                | Data model, API conventions, authentication, frontend and referral algorithm in implementable detail                                        |
| 04  | [Security and threat model](04-security-and-threat-model.md) | What can go wrong, what stops it, what is verified, and what is still open                                                                  |
| 05  | [Sprint plan](05-sprint-plan.md)                             | What gets built in what order, the launch gate, and what to cut first                                                                       |
| 06  | [Third-party providers](06-third-party-providers.md)         | Which email, storage, hosting, database and operations services to use, free tiers, and what each means for the data-location rule          |
| ADR | [Decision records](adr/)                                     | Why the repo layout, referral, hosting, auth, video and toolchain choices were made                                                         |

Documents are drafts for the founders to challenge. Where a document says "to confirm" or "not verified",
it means exactly that. Change a decision by adding a new ADR, not by editing an accepted one.
