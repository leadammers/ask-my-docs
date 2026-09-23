# T04 — AI provider layer, env, rate limiting

**Mode:** hand-off · **Priority:** P0 · **Depends on:** T01, T02 · **Estimate:** 0.75h · **Your time:** 10 min

## Goal
All AI calls in the app go through one small layer that reads provider and models from env, handles quota errors, logs usage — and a rate limiter guards every AI-calling route.

## Context
`docs/architecture.md` §5 and §6. `docs/decisions.md` D-04.

## Scope
- `lib/ai/provider.ts`: returns `chatModel()` and `embeddingModel()` for `AI_PROVIDER` = `google` (`@ai-sdk/google`) | `openai-compatible` | `ollama` | `mock`.
- **`mock` provider** for E2E tests and CI (AI SDK mock models from `ai/test`): deterministic chat answers that cite `[1]`, deterministic embeddings (hash of the text → normalised 768-dim vector). `lib/env.ts` **refuses `AI_PROVIDER=mock` when `NODE_ENV=production` on Vercel** (`VERCEL_ENV=production`) — it must never reach the live app. Model IDs from `lib/env.ts` only.
- `lib/ai/embeddings.ts`:
  - `embedDocuments(texts: string[])` → batched `embedMany`, task type `RETRIEVAL_DOCUMENT`, dimensions from env
  - `embedQuery(text: string)` → task type `RETRIEVAL_QUERY`
  - batch size configurable (default 50), sequential batches
- `lib/ai/retry.ts`: `withRetry(fn)` — exponential backoff with jitter on HTTP 429/503, max 3 attempts; after that throws `QuotaExceededError` with a user-facing message
- `lib/ai/usage.ts`: log `{ requestId, userId, operation, model, inputTokens, outputTokens, durationMs }` as JSON
- `lib/rate-limit.ts`: `assertWithinLimit(userId, kind, limit, windowSeconds)` backed by `usage_events` (count in window, insert on success); throws `RateLimitError`
- **Global daily cap:** `assertGlobalDailyCap()` counts all `usage_events` with an AI kind since midnight UTC against `AI_GLOBAL_DAILY_CAP`; throws `DailyCapReachedError` (user message: "The daily demo limit is reached — please try again tomorrow."). Counting needs the service-role client or a `security definer` count function with fixed `search_path` — justify the choice in the migration (`conventions/database.md`)
- `lib/errors.ts`: typed app errors → `{ status, userMessage }` mapping, used by routes
- Unit tests: retry behaviour (mocked), rate-limit window logic (mocked DB), error mapping

## Out of scope
Wiring the checks into routes happens in each AI task: T05 (embeddings), T07, T09, T11 call `assertWithinLimit` **and** `assertGlobalDailyCap` before any model call.

TTS (T11). Any route or UI.

## Acceptance criteria
- [ ] `grep -rn "gemini-" lib app` finds nothing except comments — no model IDs in code
- [ ] `scripts/smoke-ai.ts` (run with `pnpm script scripts/smoke-ai.ts`; the agent may run it) embeds one sentence and completes one short prompt against the real API, printing dimensions and token usage
- [ ] Retry, rate-limit and global-cap unit tests pass
- [ ] Unit test: `AI_PROVIDER=mock` with `VERCEL_ENV=production` fails env validation

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm script scripts/smoke-ai.ts
```

## Notes for the agent
- `@ai-sdk/google` embedding options: pass `outputDimensionality` and `taskType` via provider options — check the current AI SDK docs for the exact option names rather than guessing.
- Never log prompt or document content, only sizes and counts.
