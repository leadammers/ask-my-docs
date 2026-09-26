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
| [T00](T00-accounts-and-keys.md) | Local tooling, accounts, keys | human | P0 | — | 1.25h | 1.25h | review |
| [T01](T01-scaffold-and-ci.md) | Next.js scaffold, tooling, CI, security scanning, Playwright | hand-off | P0 | — | 1.5h | 5 min | review |
| [T02](T02-schema-and-rls.md) | Local Supabase, schema, RLS, storage | hand-off | P0 | T00, T01 | 1.25h | 10 min | review |
| [T02b](T02b-demo-password-gate.md) | Demo password gate (signed cookie in front of the app) | shared | P0 | T02 | 0.75h | 10 min | review |
| [T03](T03-auth-notebooks-deploy.md) | Anonymous auth + CAPTCHA, notebooks CRUD, first deploy | shared | P0 | T02b | 1.75h | 30 min | in-progress |
| [T04](T04-ai-provider-layer.md) | AI provider layer, rate limits, global cap | hand-off | P0 | T01, T02 | 0.75h | 10 min | todo |
| [T05](T05-pdf-ingestion.md) | PDF upload and ingestion pipeline | hand-off | P0 | T03, T04 | 2.25h | 5 min | todo |
| [T06](T06-hybrid-retrieval.md) | Hybrid retrieval (vector + full-text, RRF) | hand-off | P0 | T05 | 1h | 10 min | todo |
| [T07](T07-grounded-chat.md) | Grounded chat with citations | agent+check | P0 | T06 | 2.25h | 20 min | todo |
| [T08](T08-workspace-ui-and-demo.md) | Notebook workspace UI + demo notebook | shared | P0 | T07 | 1.75h | 45 min | todo |
| — | **MVP submittable** | | | | **~13.75h** | **~3.5h** | |
| [T09](T09-notebook-guide.md) | Notebook guide | hand-off | P1 | T08 | 1.25h | 5 min | todo |
| [T10](T10-more-source-types.md) | Text, Markdown and URL sources | hand-off | P2 | T08 | 1.75h | 5 min | todo |
| [T13](T13-evaluation.md) | Evaluation | shared | P0 | T08 | 1.5h | 45 min | todo |
| [T14](T14-hardening.md) | Hardening and polish | agent+check | P0 | T08 | 1.25h | 20 min | todo |
| [T12](T12-saved-notes.md) | Saved notes | hand-off | P3 | T08 | 1.25h | 5 min | todo |
| [T11](T11-audio-overview.md) | Audio overview (timeboxed 3h) | shared | Stretch | T09 | 3h | 30 min | todo |
| [T15](T15-docs-and-video.md) | README, diagram, Loom video | shared | P0 | all | 1.5h | 1.5h | todo |
| — | **Total** | | | | **~25.25h** | **~6.8h** | |

**By mode:** human: T00 · hand-off: T01, T02, T04, T05, T06, T09, T10, T12 · agent+check: T07, T14 · shared: T03, T08, T11, T13, T15

**Budget warning:** ~25h of agent-assisted work against a ~20h budget. E2E tests added ~2.5h of *agent* time and saved some of yours. Watch the cut line closely.

**Cut line** (from `docs/scope.md`): T13 (evaluation) and T14 (hardening) are part of the MVP and are never cut. If behind by day 4, drop T11 (audio overview) first, then T12 (saved notes), then the URL part of T10.

**Recommended order after the MVP:** T09 → T10 → T13 → T14 → T12 → T11 → T15. T13 and T14 come before the remaining extras — they are guaranteed, the extras are not.

## Release to production (human)

Development runs against the **local** Supabase stack. Production is the hosted project and is only touched by you:

1. Review new migrations in `supabase/migrations/`
2. `supabase db push` (hosted project, linked in T00)
3. Push `main` → Vercel deploys
4. If seed data changed (T08, T09, T11): run `pnpm script scripts/seed-demo.ts` with production env values
5. Smoke-test the live URL in an incognito window

Release after T03 (first deploy), T06, T08, and after every extra that adds a migration or seed data. Deploy early and often; a late deployment surprise is the biggest schedule risk.
