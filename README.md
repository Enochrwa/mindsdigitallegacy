# Mindsdigitallegacy

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mindsdigitallegacy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e07e1cb4-6bcc-4499-8146-a3f6405b950f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Platform architecture

This repository holds the whole Minds Digital Legacy platform.

| Part | Location | Notes |
|---|---|---|
| Website and learner portal (TanStack Start, React 19) | repo root | Lovable-synced; do not move it (see `docs/adr/0001`) |
| API (Node 26 LTS, Express 5, TypeScript, MongoDB) | [`backend/`](backend/README.md) | Security-hardened, tested |
| Design, research, threat model, sprint plan | [`docs/`](docs/README.md) | Start with `docs/README.md` |
| CI, security scanning, Dependabot | `.github/` | Actions pinned to commit SHAs |

Run the API locally: see [`backend/README.md`](backend/README.md). Report security issues as described in
[`SECURITY.md`](SECURITY.md).
