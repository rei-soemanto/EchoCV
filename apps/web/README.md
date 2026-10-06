# apps/web

Next.js app (App Router, Tailwind, shadcn/ui): UI, API routes and in-browser vision.
See the root [README](../../README.md) for setup.

```bash
pnpm dev          # http://localhost:3000
pnpm lint
pnpm test         # Vitest (tests/unit)
pnpm test:e2e     # Playwright (tests/e2e)
pnpm build
```

Model files for `lib/vision` go in `public/models/`; they are git-ignored and pulled from the
Hugging Face Hub.
