# ADR-0003: Personal data is stored in Rwanda; the database location is configuration

- Status: **Proposed. Needs legal confirmation and a founder decision.**
- Date: 2026-11-13

## Context

Law No. 058/2021 (per DLA Piper) requires personal data to be stored in Rwanda. Storage abroad is allowed
only with a valid NCSA registration certificate authorising it. MongoDB Atlas has an AWS Cape Town region
but no Rwanda region. TrAC Kigali offers a Tier III data centre and "My.cloud" IaaS (vendor claims, to confirm).

## Options

1. **Self-managed MongoDB replica set on Rwanda-hosted IaaS** (recommended for production PII).
   More operations work (patching, backups, monitoring); lawful by default.
2. Atlas Cape Town with NCSA authorisation for storage abroad. Less operations work; depends on the
   authorisation and on a written transfer contract.
3. Atlas Cape Town without authorisation. **Not acceptable** for personal data.

## Decision

- The code is hosting-agnostic: `MONGODB_URI` is the only coupling.
- Production personal data goes to option 1 unless counsel confirms option 2 is authorised.
- Local and staging use synthetic data only, so Atlas or any cloud is fine there.
- Backups stay in Rwanda too, encrypted, with a quarterly restore test.

## Consequences

- Ops burden is real for a two-person team; keep the stack small and automate backups and alerts.
- A launch gate in the sprint plan blocks real registrations until this ADR is Accepted and the NCSA
  registration is submitted.
