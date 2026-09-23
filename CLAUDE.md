@AGENTS.md
@conventions/README.md
@conventions/principles.md
@conventions/security.md

Area conventions — read the file before working in that area:
- TypeScript, React, server actions, route handlers, tests → `conventions/code.md`
- Migrations, SQL, RLS, storage → `conventions/database.md`
- Model calls, prompts, embeddings, TTS → `conventions/ai.md`

## Claude Code specifics

- Start a task with `/next-task` (or `/next-task T05` for a specific one).
- Use plan mode for tasks estimated at 2h or more; show the plan before editing.
- When a verification command fails, fix and re-run — do not report partial success as done.
- After finishing, add one line to the log table in `docs/ai-workflow.md` for this task, describing what you did. Leave the human-review column for the user.
