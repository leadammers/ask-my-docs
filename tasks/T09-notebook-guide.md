# T09 — Notebook guide

**Mode:** hand-off · **Priority:** P1 · **Depends on:** T08 · **Estimate:** 1.25h · **Your time:** 5 min (diff review)

## Goal
Each notebook shows an auto-generated summary, key topics and 3-5 suggested questions, refreshed when its sources change.

## Context
`docs/architecture.md` §4.4.

## Scope
- `lib/studio/guide.ts`: map-reduce — per source, summarise the first ~N chunks (bounded token budget); then one `generateObject` call with Zod schema `{ summary: string, topics: {title, description}[] (3-6), questions: string[] (3-5) }`
- Cache in `notebook_guides` with `source_fingerprint` (hash of sorted ready source ids); regenerate on demand when stale
- Studio panel "Notebook guide" card: summary, topic chips (click → asks "Tell me about <topic>"), suggested questions (click → sends to chat)
- Suggested questions also appear in the empty chat state
- Generate automatically after the first source becomes ready; "Regenerate" button when stale
- Precompute the guide for the demo notebook in `seed-demo.ts`
- Rate limit under `chat`, plus the global daily cap

## Acceptance criteria
- [ ] Guide appears within ~15s after the first source is ready
- [ ] Adding a source marks the guide stale; regenerating updates it
- [ ] Clicking a suggested question produces a cited answer
- [ ] Invalid model output (schema mismatch) is retried once, then shows an error state — never a crash

## E2E tests (Playwright, `e2e/`)
- After a source becomes ready, the guide card shows summary, topics and questions (mock model)
- Clicking a suggested question sends it to the chat
- Adding a source marks the guide stale; regenerate updates it
- Mock returns invalid output → error state, no crash

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```
