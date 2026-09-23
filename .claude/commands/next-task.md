---
description: Pick up the next ready task (or the one given) and implement it following AGENTS.md
argument-hint: "[task id, e.g. T05]"
---

1. Read `AGENTS.md`, `tasks/README.md`, and the relevant docs.
2. Select the task: if `$ARGUMENTS` names one, use it; otherwise take the first task with status `todo` whose dependencies are all `done`. If its mode is `human`, stop and tell the user what they need to do. If it is `shared` or `agent+check`, do the agent part and end with the human's remaining steps.
3. Read the task file completely. Summarise its goal and acceptance criteria in 3-5 lines, list the files you expect to touch, and wait for confirmation if the estimate is 2h or more.
4. Set its status to `in-progress` in `tasks/README.md`.
5. Implement within the task's scope only.
6. Run the task's verification commands and the standard checks from `AGENTS.md`. Fix until green.
7. Report each acceptance criterion as met / not met with evidence.
8. Set status to `review`, append a line to the log in `docs/ai-workflow.md`, and commit as `<type>(<task id>): <summary>`. Do not push.
