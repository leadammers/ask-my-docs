# Task Board

Agents: take the first `todo` task whose dependencies are all `done` (see `AGENTS.md`).
Statuses: `todo` → `in-progress` → `review` → `done`. Only the human sets `done`.
Estimates are agent-assisted totals; **Your time** is the human share within them.

## Modes

| Mode | Meaning |
|---|---|
| `human` | Only a human can do it: accounts, secrets, production, recording, submitting |
| `hand-off` | The agent builds **and** verifies it completely — unit tests, pgTAP and Playwright E2E. You only review the diff |
| `agent+check` | Mechanics are covered by tests, but something needs human judgement (answer quality, Lighthouse, a final look) |
| `shared` | Contains a human decision or contribution the agent can't make: choosing content, judging quality, releasing to production |

Every task file has a **Your part** section unless it is `hand-off`.

## Board

| ID | Task | Mode | Priority | Depends on | Est. | Your time | Status |
|---|---|---|---|---|---|---|---|
| [T00](T00-accounts-and-keys.md) | Local tooling, accounts, keys | human | P0 | — | 1.25h | 1.25h | done |
| [T01](T01-scaffold-and-ci.md) | Next.js scaffold, tooling, CI, security scanning, Playwright | hand-off | P0 | — | 1.5h | 5 min | done |
| [T02](T02-schema-and-rls.md) | Local Supabase, schema, RLS, storage | hand-off | P0 | T00, T01 | 1.25h | 10 min | done |
| [T02b](T02b-demo-password-gate.md) | Demo password gate (signed cookie in front of the app) | shared | P0 | T02 | 0.75h | 10 min | done |
| [T03](T03-auth-notebooks-deploy.md) | Anonymous auth + CAPTCHA, notebooks CRUD, first deploy | shared | P0 | T02b | 1.75h | 30 min | done |
| [T04](T04-ai-provider-layer.md) | AI provider layer, rate limits, global cap | hand-off | P0 | T01, T02 | 0.75h | 10 min | review |
| [T05](T05-pdf-ingestion.md) | PDF upload and ingestion pipeline | hand-off | P0 | T03, T04 | 2.25h | 5 min | done |
| [T06](T06-hybrid-retrieval.md) | Hybrid retrieval (vector + full-text, RRF) | hand-off | P0 | T05 | 1h | 10 min | done |
| [T07](T07-grounded-chat.md) | Grounded chat with citations | agent+check | P0 | T06 | 2.25h | 20 min | review |
| [T08](T08-workspace-ui.md) | Notebook workspace UI (two columns, source selection, citation viewer, dark mode) | agent+check | P0 | T07, T08c | 4.25h | 25 min | review |
| [T08b](T08b-data-retention.md) | Data retention for inactive users + retention banner and footer notice | shared | P0 | T05 | 1.5h | 15 min | review |
| [T08c](T08c-demo-notebook.md) | Demo notebook seeding (`seed-demo.ts`, seed documents) | shared | P0 | T05, T07 | 0.75h | 20 min | todo |
| — | **MVP submittable** | | | | **~18.5h** | **~3.8h** | |
| [T16](T16-i18n.md) | Internationalisation (English + German UI, localised errors) | agent+check | P2 | T08 | 3h | 20 min | todo |
| [T09](T09-notebook-guide.md) | Notebook guide | hand-off | P1 | T08 | 1.25h | 5 min | todo |
| [T10](T10-more-source-types.md) | Text, Markdown and URL sources | hand-off | P2 | T08 | 1.75h | 5 min | todo |
| [T13](T13-evaluation.md) | Evaluation | shared | P0 | T08 | 1.5h | 45 min | todo |
| [T14](T14-hardening.md) | Hardening and polish | agent+check | P0 | T08 | 1.25h | 20 min | todo |
| [T12](T12-saved-notes.md) | Saved notes | hand-off | P3 | T08 | 1.25h | 5 min | todo |
| [T11](T11-audio-overview.md) | Audio overview (timeboxed 3h) | shared | Stretch | T09 | 3h | 30 min | todo |
| [T15](T15-docs-and-video.md) | README, diagram, Loom video | shared | P0 | all | 1.5h | 1.5h | todo |
| — | **Total** | | | | **~30h** | **~7.2h** | |

**By mode:** human: T00 · hand-off: T01, T02, T04, T05, T06, T09, T10, T12 · agent+check: T07, T08, T14, T16 · shared: T03, T08b, T08c, T11, T13, T15

**Budget warning:** ~30h of agent-assisted work against a ~20h budget. The rework of T08 (2026-09-28) split the demo notebook out into T08c and re-estimated the workspace honestly — the two additions together are ~2.5h more than the old single row claimed, which is the estimate catching up with the scope, not scope being added. E2E tests added ~2.5h of *agent* time and saved some of yours. Watch the cut line closely.

**Cut line** (from `docs/scope.md`): T13 (evaluation) and T14 (hardening) are part of the MVP and are never cut. If behind by day 4, drop T11 (audio overview) first, then T12 (saved notes), then the URL part of T10. T16 (i18n) was added after the plan; it runs before T09 so later UI work writes strings into the message files instead of being retrofitted. Its ~3h is not in the totals, so it pushes the budget warning further — cut it only after T11 and T12.

**Recommended order after the MVP:** T16 → T09 → T10 → T13 → T14 → T12 → T11 → T15. T13 and T14 come before the remaining extras — they are guaranteed, the extras are not.

## Release to production (human)

Development runs against the **local** Supabase stack. Production is the hosted project and is only touched by you:

0. Add `DEMO_CODE_PEPPER` (`openssl rand -hex 32`) to the Vercel env. Keep `DEMO_PASSWORD` for now (the old build still needs it); never rotate the pepper later, it invalidates every code (D-24)
1. Review new migrations in `supabase/migrations/`
2. `supabase db push` (hosted project, linked in T00). **Cutover:** this migration clears entitlements and makes `code_id` required, so the old build's password login fails from here until step 3's deploy is live (keeping `DEMO_PASSWORD` does not help). Do steps 2 and 3 back to back with the PR already approved and green, and not while a reviewer is active. If the deploy fails, fix forward and redeploy; there is nothing to roll back
3. Merge `dev` into `main` through a reviewed PR → the `deploy-prod` job in CI deploys (the Vercel Git integration is off, D-23). Land any migration the new code depends on in step 2 first. Once it is live, remove `DEMO_PASSWORD` from Vercel
4. If seed data changed (T08c, T09, T11): run `pnpm script scripts/seed-demo.ts` with production env values
5. Smoke-test the code path (needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the same `DEMO_CODE_PEPPER` as Vercel, from the Supabase dashboard and your own copy of the pepper, in a throwaway `.env.production.local`; below `CLI` = `pnpm exec tsx --env-file=.env.production.local scripts/demo-codes.ts`):
   1. `CLI create "smoke test" --days 1` — copy the printed code and the id
   2. Open `ask-my-docs-demo.vercel.app` in an incognito window and enter the code at `/demo-login`: you should land on the notebooks page. "Invalid or expired" means the CLI's `DEMO_CODE_PEPPER` differs from Vercel's: fix the env file and repeat
   3. `CLI revoke <id>`, then reload the incognito window: the demo notebook should no longer open and creating a notebook should be refused. Notebooks that session already owns stay accessible, which is intended
6. Issue one code per reviewer: `CLI create "<name>"` (14 days, 3 devices by default). Send each code out of band. A reviewer's seat frees 8 hours after their last entry, so tell them to use one browser

Release after T03 (first deploy), T06, T08, and after every extra that adds a migration or seed data. Deploy early and often; a late deployment surprise is the biggest schedule risk.
