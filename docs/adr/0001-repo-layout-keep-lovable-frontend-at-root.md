# ADR-0001: Keep the Lovable frontend at the repo root; add `backend/` and `docs/` beside it

- Status: Superseded by ADR-0007 (kept as history)
- Date: 2026-11-13

## Context

The repository already contains a TanStack Start (React 19) site connected to Lovable. `AGENTS.md` says pushes
to the branch sync into Lovable and history must never be rewritten. The brief asks for a MERN platform with
a Node backend and a React frontend. TanStack Start is a React framework, so the React requirement holds.

## Options

1. **Keep the frontend at the root, add `backend/`** (chosen).
2. Move the frontend to `apps/web` and create a workspace monorepo. Cleaner, but Lovable expects the project
   at the root; moving it risks breaking the sync and is hard to undo.
3. Separate repositories. Clean boundaries, but splits docs, CI and issues for a two-person team.

## Decision

Option 1. Frontend files stay where Lovable expects them. New work lives in `backend/`, `docs/` and
`.github/`. CI uses path filters so each side builds and tests only when it changes.

## Consequences

- No frontend code is moved or reformatted. ESLint's Prettier rule currently reports 131 formatting errors in
  Lovable-generated files, so frontend CI lints with `prettier/prettier` off. A deliberate, format-only
  commit can remove that exception later.
- The root `package.json` belongs to the frontend, and the backend has its own `package.json`.
  They must not share a lockfile.
- If the team stops using Lovable, revisit option 2.
