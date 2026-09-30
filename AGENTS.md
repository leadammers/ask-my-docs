# AGENTS.md

Operating manual for coding agents working in this repository. Read this fully before starting any task.

## Project in one paragraph

ask-my-docs is a NotebookLM clone: users create notebooks, add sources (PDF, text, URL), and chat with them. Answers are grounded only in the sources and carry clickable citations. Extras: notebook guide, audio overview, saved notes. It is a one-week take-home task for a job application, deployed live on Vercel + Supabase with the Gemini free tier.

Before writing code, read:

- `docs/scope.md` — what is in and out of scope, priorities
- `docs/architecture.md` — stack, data model, pipelines, directory layout
- `docs/decisions.md` — decisions already made; do not reopen them silently
- `conventions/` — how code is written here (see below)

## How to work

1. **One task at a time.** Work only from a file in `tasks/`. Take the first task with status `todo` in `tasks/README.md` whose dependencies are all `done`. If the user names a task, do that one.
2. **Read the whole task file first.** Stay inside its scope. If something outside the task is needed, stop and say so instead of doing it.
3. **Plan briefly, then implement.** State the files you will create or change before editing.
4. **Verify.** Run every command under *Verification* in the task file, plus the standard checks below. Fix failures before reporting.
5. **Check the acceptance criteria one by one** and report each as met / not met, with evidence.
6. **Human part.** For `agent+check` and `shared` tasks, finish your part, then list exactly what the human still has to do (from the task's *Your part*).
7. **Update status.** Set the task to `review` in `tasks/README.md`. Only the human sets `done`.
8. **Commit** once per task after checks pass: `<type>(T0X): <summary>` (Conventional Commits, e.g. `feat(T05): ingest PDFs into chunks`). **Never push without the human's explicit, real-time approval of that specific push** (see "Things the agent must not do").
   Branch naming: work happens on `dev` (branched from `main`); for a task large enough to warrant its own branch, branch from `dev` as `<type>/T0X-slug` (e.g. `feat/t05-pdf-ingestion`), matching the commit type. `main` only moves via a reviewed merge from `dev`.

If a task is ambiguous, contradicts the docs, or turns out much larger than estimated: stop and ask. Do not guess on architecture.

## Standard checks (must pass before a task goes to review)

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e      # needs the local stack (pnpm db:start), .env.test.local (copy .env.test.example)
                   # and port 3000 free — stop `pnpm dev` first, the run fails if it isn't
                   # Also export the Supabase vars as `supabase status -o env` names them (see Repo
                   # notes): .env.test.local is loaded by the Next app, not by the Playwright runner,
                   # so on its own it leaves e2e/entitle.ts throwing and ~20 of 31 specs failing
                   # before any app code runs — which reads as a broken branch, not a missing env
```

Git hooks (husky, installed by `pnpm install`) run these automatically: pre-commit runs lint-staged (ESLint `--fix` + Prettier on staged files), commit-msg runs commitlint (Conventional Commits, `commitlint.config.mjs`), pre-push runs `pnpm typecheck` and `pnpm test`. Do not bypass them with `--no-verify`; CI runs `pnpm format:check` anyway.

## Conventions

All coding rules live in [`conventions/`](conventions/README.md). Read `principles.md` and `security.md` before every task; read `code.md`, `database.md` or `ai.md` before touching those areas. Rules conflict? Security > correctness > simplicity > DRY.

Every task that adds an entry point (server action, route handler, SQL function) runs the review checklist at the end of `conventions/security.md`.

## Things the agent must not do

- Push, force-push, or rewrite history **autonomously**. These require the human's explicit, real-time approval of that specific command (`.claude/settings.json` prompts for it) — never assumed from an earlier approval, never batched, and never for `main`/`dev` directly (feature branches only)
- Change branch protection
- Create accounts, touch real API keys, or change Vercel/Supabase dashboard settings — those are human tasks (mode `human`)
- Run anything against the **hosted** Supabase project: `supabase db push`, `supabase link`, `--linked` flags, seeding production. Development uses the local stack only; releases are human (see `tasks/README.md`)
- Add dependencies not mentioned in the task without asking first
- Change `docs/decisions.md` except to *append* a proposed decision marked `proposed`
- Mark a task `done`

## Permissions

`.claude/settings.json` allows the safe commands without asking, **prompts for approval** on `git push` and `git rebase` (per-call, never pre-approved), and **blocks** anything touching the hosted Supabase project and reading `.env.local`. If a command is denied, that is the rule — ask the user, do not work around it.

## Commands

```bash
corepack enable            # once, provides pnpm
pnpm install
pnpm dev                   # http://localhost:3000
pnpm lint | typecheck | test | build
pnpm format                # Prettier (Airbnb-style: single quotes, width 100); format:check to verify
pnpm db:start              # local Supabase in Docker
pnpm db:reset              # re-apply migrations + seed locally
pnpm db:test               # pgTAP tests (RLS)
pnpm db:types              # regenerate lib/supabase/types.ts from the local DB
pnpm script scripts/x.ts   # run a script with .env.local (may call Gemini)
pnpm eval                  # run the evaluation (T13)
```

## Repo notes (claude-cost-orchestrator /optimize)

- E2E env vars come from `supabase status -o env` (API_URL → `NEXT_PUBLIC_SUPABASE_URL`, ANON_KEY → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, SERVICE_ROLE_KEY → `SUPABASE_SERVICE_ROLE_KEY`) — export them in the shell, they are in no `.env` file, and `.env.test.local` is not read by the Playwright runner (see "Standard checks").
- Playwright + Radix Dialog: while a dialog is open, the rest of the page is `aria-hidden` — role queries on background content fail until the dialog closes, even though the DOM elements exist.
- `SKIP_ENV_VALIDATION=1` is set for every CI job (lint/test/build/e2e) — `lib/env.ts`'s Zod validation only actually runs in the `vercel build` deploy steps, which pull real env vars via `vercel pull`.
- Local Supabase's default-privilege bootstrap pre-grants broad table privileges to `authenticated`/`service_role`; the hosted project has none. A migration that only adds GRANTs (without `revoke all` first) passes local pgTAP but still fails "permission denied" on hosted — revoke first, then grant exactly what RLS allows.
- `next/font/google` variable names must match what `app/globals.css`'s `@theme inline` expects (`--font-sans`) — a mismatched name (e.g. `--font-geist-sans`) silently never applies the font.
- This Next.js version's error boundary (`error.tsx`) uses a `retry` prop, not `reset` (stable since v16.3.0) — see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
