# How this project was built with AI

The task description explicitly welcomes AI tools. This document shows how they were used — and where human judgement stayed in the loop.

---

## The loop

```text
1. Scope        I define what to build and what not to build        -> docs/scope.md
2. Decide       I make the architecture decisions, with trade-offs  -> docs/decisions.md
3. Specify      Work is split into small tasks with acceptance
                criteria and verification commands                  -> tasks/
4. Implement    A coding agent takes ONE task, following AGENTS.md
5. Verify       The agent runs lint, typecheck, tests, build;
                I review the diff and test the feature by hand
6. Record       Task marked done, decisions or corrections logged   -> this file
```

The agent never picks its own scope. It works from a written task, and a task is only done when its acceptance criteria are checked — not when the code compiles.

## Tools

| Tool | Used for |
|---|---|
| Claude (planning chat) | Scoping, architecture decisions, writing task files |
| Claude Code (coding agent) | Implementing tasks, running checks |
| Me | Decisions, reviews, manual testing, anything touching secrets or accounts |

## What stayed human

- Scope, priorities and the cut line
- Architecture and provider choices
- Creating accounts, handling API keys and secrets
- Reviewing every diff before merge
- Manual testing of each feature in the deployed app
- The evaluation questions (written before tuning the prompts)

## Log

Add a short entry per task: what the agent did well, what had to be corrected, anything learned.

| Task | Agent notes | Human review |
|---|---|---|
| T01 | Scaffolded Next.js (App Router, TS strict, Tailwind, shadcn/ui), `lib/env.ts`/`result.ts`/`errors.ts`, Vitest + Playwright, CI (lint/typecheck/test/build + Gitleaks + audit + e2e job) and Dependabot. `pnpm format` reformatted existing docs/tasks/conventions in one pass — reverted and added a `.prettierignore` exclusion so it can't recur. All standard checks pass locally. | — |
