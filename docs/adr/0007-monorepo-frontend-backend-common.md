# ADR-0007: Frontend, backend and common root; the site builder is removed

- Status: Accepted
- Date: 2026-11-13
- Supersedes: ADR-0001

## Context

ADR-0001 kept the frontend at the repository root because the site builder that generated it expected that
layout. The founders no longer want that dependency, and a root that mixes frontend config with shared files
makes per-part CI and ownership unclear.

## Decision

- `frontend/` holds the website (own `package.json`, Bun lockfile, configs, `.gitignore`, README).
- `backend/` holds the API (unchanged).
- The repository root is common: `docs/`, `.github/`, `README.md`, `SECURITY.md`, `CODEOWNERS`, editor and git settings.
- GitHub reads workflows only from the root `.github/workflows/`, so each part gets its own workflow file there
  (`frontend-ci.yml`, `backend-ci.yml`) restricted by `paths:` and `working-directory`. Dependabot lists each folder.
- The builder's Vite wrapper package, its project metadata, agent instructions and error-reporting hook are removed.
  `frontend/vite.config.ts` now configures the same plugins explicitly: Tailwind, tsconfig paths, TanStack Start
  (server entry `src/server.ts`), Nitro (Cloudflare module preset, build only) and React.
- Files were moved with `git mv`; history is preserved and not rewritten.

## Consequences

- Hosting is still undecided (ADR-0003); the Cloudflare preset is only the build default and can be changed in one line.
- The wrapper's dev-only devtools plugin and sandbox-specific behaviour are not carried over.
- ADR-0001 stays in the repo as history and mentions the old tool by name.
