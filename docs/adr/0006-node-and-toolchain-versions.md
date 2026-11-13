# ADR-0006: Target Node.js 26 LTS, support 24 and later; pin TypeScript below 6.1

- Status: Accepted
- Date: 2026-11-13

## Context

On 2026-11-13, Node 26 is the Active LTS (security support to 30 Apr 2029). Node 24 is in maintenance (to
30 Apr 2028). Node 22 ends 30 Apr 2027. Node 20 reached end-of-life on 30 Apr 2026. `typescript-eslint` 8.72
declares a peer range of TypeScript `>=4.8.4 <6.1.0`, so the newest TypeScript major cannot be used yet.

## Decision

- `.nvmrc` and the Docker image use Node 26. `engines.node` is `>=24`. CI runs on 24 and 26.
- TypeScript stays within the range `typescript-eslint` supports. Revisit when the peer range widens.
- Use Node's built-in `--env-file` instead of `dotenv`, and built-in `node:test` is not used because the
  frontend already uses Vitest.
- Dependabot opens weekly update PRs with a cooldown to avoid taking brand-new releases immediately.

## Consequences

- Fewer dependencies in the backend. Local development needs Node 24 or newer.
- When Node 24 leaves maintenance, raise the `engines` floor in a deliberate PR.
