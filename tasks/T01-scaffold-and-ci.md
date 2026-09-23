# T01 — Next.js scaffold, tooling, CI

**Mode:** hand-off · **Priority:** P0 · **Depends on:** — · **Estimate:** 1.5h · **Your time:** 5 min

## Goal
An empty but production-shaped Next.js app where `pnpm lint`, `typecheck`, `test` and `build` all pass locally and in GitHub Actions.

## Context
`docs/architecture.md` §2 (stack) and §8 (directory layout).

## Scope
- **The repo is not empty** (docs, conventions, tasks), so `create-next-app` refuses to run in place: scaffold into a temporary folder and move the files in; merge its `.gitignore` into ours, keep our `README.md`
- `create-next-app` with App Router, TypeScript, Tailwind, ESLint, `src/`-less layout (use `app/`, `lib/`, `components/` at root)
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`
- Prettier + `prettier-plugin-tailwindcss`; ESLint config compatible with Prettier
- shadcn/ui initialised (button, input, card, dialog, dropdown-menu, checkbox, scroll-area, sonner, skeleton, tabs, textarea, tooltip)
- Vitest configured with one trivial passing test
- `package.json` scripts: `dev`, `build`, `start`, `lint` (`eslint .` — recent Next.js versions removed `next lint`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `format`, and `script` = `tsx --conditions=react-server --env-file=.env.local` so `pnpm script scripts/x.ts` works (`tsx` as dev dependency)
- **`server-only` gotcha:** the package throws outside a React Server environment. Vitest: alias `server-only` to an empty module in `vitest.config.ts`. Scripts: the `react-server` condition above.
- `lib/env.ts`: Zod schema for all variables in `.env.example`; server vars and `NEXT_PUBLIC_` vars separated; fails fast with a readable error listing missing variables. **Skip validation when `SKIP_ENV_VALIDATION=1`** (used in CI build).
- `.github/workflows/ci.yml`: on push and PR — checkout, pnpm setup, Node 22, install with cache, lint, typecheck, test, build (with `SKIP_ENV_VALIDATION=1`). Pin actions to major versions.
- **CI security** (`conventions/security.md` §10-11): Gitleaks job (`gitleaks/gitleaks-action`), `pnpm audit --audit-level=high`, install with `--frozen-lockfile`; `.github/dependabot.yml` for `npm` and `github-actions` (weekly)
- ESLint: `@typescript-eslint/no-floating-promises` as error; forbid `dangerouslySetInnerHTML` (`react/no-danger`)
- `lib/result.ts` (`Result<T>`, `ok()`, `fail()`) and `lib/errors.ts` skeleton as described in `conventions/code.md`
- **Playwright** (`@playwright/test`, `@axe-core/playwright`): `playwright.config.ts` with `webServer` (`pnpm build && pnpm start` in CI, `pnpm dev` locally), Chromium only (fast; add more later if time allows), traces on first retry; tests in `e2e/`; script `test:e2e`
- One smoke test: the placeholder page renders and has no axe violations
- CI: separate `e2e` job that installs Playwright browsers (cached) and runs `pnpm test:e2e`; uploads the HTML report as an artifact on failure
- `packageManager` field set so corepack picks pnpm.
- Replace the default landing page with a minimal "ask-my-docs" placeholder.

## Out of scope
Supabase, AI SDK, any feature.

## Acceptance criteria
- [ ] All four standard checks pass locally
- [ ] CI workflow file exists and runs the four checks plus Gitleaks and `pnpm audit`
- [ ] `dependabot.yml` present
- [ ] `pnpm test:e2e` passes locally and the CI `e2e` job is defined
- [ ] Importing `env` with a missing variable throws an error naming the variable (unit test)
- [ ] Layout matches `docs/architecture.md` §8; existing docs, conventions and tasks untouched
- [ ] A test importing a module that imports `server-only` runs under Vitest

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && SKIP_ENV_VALIDATION=1 pnpm build && pnpm test:e2e
```
