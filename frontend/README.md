# MDL frontend

Website and learner portal. TanStack Start (React 19), Vite, Tailwind 4, shadcn/ui, Vitest. Package manager: Bun.

```sh
cd frontend
bun install --ignore-scripts
bun run dev      # http://localhost:8080
bun run test
bun run build    # Nitro, Cloudflare module preset, output in .output/
```

CI: `.github/workflows/frontend-ci.yml` (typecheck, lint, test, build) runs only when `frontend/**` changes.
Only `VITE_*` variables reach the browser; see `.env.example`. Never put secrets in them.
