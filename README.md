# Minds Digital Legacy (MDL)

Software products, internships and free, referral-unlocked training for Rwanda and beyond.

## Repository layout

| Part | Location | CI workflow |
|---|---|---|
| Website and learner portal (TanStack Start, React 19, Bun) | [`frontend/`](frontend/README.md) | `.github/workflows/frontend-ci.yml` |
| API (Node 26 LTS, Express 5, TypeScript, MongoDB) | [`backend/`](backend/README.md) | `.github/workflows/backend-ci.yml` |
| Common: design, research, threat model, sprint plan | [`docs/`](docs/README.md) | n/a |
| Common: security scanning, Dependabot, CODEOWNERS | `.github/` | `codeql.yml`, `secret-scan.yml`, `dependency-review.yml` |

GitHub only reads workflows from the root `.github/workflows/`, so each part has its own workflow file there,
limited to its folder with `paths:` filters and `working-directory`.

Report security issues as described in [`SECURITY.md`](SECURITY.md). Start reading at [`docs/README.md`](docs/README.md).
