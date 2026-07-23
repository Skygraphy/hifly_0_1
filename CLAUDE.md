## Tech-Stack
Next.js
React
TypeScript
Tailwind
shadcn/ui
Zustand
TanStack Query
Drizzle ORM
PostgreSQL
Supabase
Auth.js
Vercel
AWS

## Conventions
- All standalone scripts (connection checks, one-off/maintenance scripts) live in `scripts/`, not scattered in the project root. Run them via the `check:*` npm scripts (e.g. `npm run check:db`, `npm run check:s3`).
- Never run a reusable operation as an inline ad-hoc shell command. Write it to a script file in `scripts/` first, then execute that file — even for operations targeting paths outside this repo.
- Every plan gets its own directory under `plans/` (e.g. `plans/<plan-name>/`), not a loose file in the project root.
- After every code change, check the result for consistency (matches surrounding patterns/conventions), readability, and elegance — not just correctness.

## Testing
- Unit/component tests: Vitest + React Testing Library. Files are co-located next to the source (`Component.test.tsx`). Run via `npm test` (single run) or `npm run test:watch`.
- E2E tests: Playwright, spec files under `e2e/`. Run via `npm run test:e2e` (auto-starts the dev server).
- `jsdom` is pinned to `26.1.0` — newer jsdom pulls in `@asamuzakjp/css-color` → `@csstools/css-calc@^3` which is ESM-only and breaks Vitest's CJS `require()` on Node <20.19 (`ERR_REQUIRE_ESM`). Don't bump jsdom past this without checking that chain (or upgrading Node to ≥20.19).
