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
pnpm test:e2e      # needs the local stack (pnpm db:start) and AI_PROVIDER=mock
```

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
pnpm db:start              # local Supabase in Docker
pnpm db:reset              # re-apply migrations + seed locally
pnpm db:test               # pgTAP tests (RLS)
pnpm db:types              # regenerate lib/supabase/types.ts from the local DB
pnpm script scripts/x.ts   # run a script with .env.local (may call Gemini)
pnpm eval                  # run the evaluation (T13)
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
