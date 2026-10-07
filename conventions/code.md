# Code: TypeScript, Next.js, React, tests

## Where code goes

```text
app/          routes only: pages, layouts, route handlers — thin, no business logic
components/   UI; components/ui is shadcn/ui (generated, edit sparingly)
lib/          all logic: ai, ingest, retrieval, chat, studio, supabase, env, errors, rate-limit
scripts/      one-off and admin scripts (seed, smoke tests, eval helpers)
```

A route handler or server action reads like a recipe: **validate → authorize → rate-limit → call `lib/` → persist → respond.** Anything longer belongs in `lib/`.

## Server vs client

- **Server Components by default.** Add `"use client"` only for interactivity (inputs, `useChat`, dialogs, polling), and keep client components as small leaves.
- Modules with secrets or privileged access (`lib/ai`, `lib/ingest`, `lib/supabase/admin.ts`, `lib/env.ts` server part) start with `import "server-only"`.
- **Mutations are server actions.** Route handlers exist only for streaming (`/api/chat`), long-running work (`/api/sources/[id]/ingest`, `/api/audio`), or endpoints the client must `fetch`.

## Server action pattern

Expected failures are **returned**, not thrown:

```ts
// lib/result.ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: UserError };

// app/(app)/actions.ts
"use server";
export async function renameNotebook(input: unknown): Promise<Result<Notebook>> {
  const parsed = RenameNotebookInput.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  const supabase = await createServerClient();
  const user = await requireUser(supabase);             // throws only if no session (unexpected)
  const notebook = await getOwnedNotebook(supabase, parsed.data.id);
  if (!notebook || notebook.is_demo) return fail("not_found");

  // ... update, revalidatePath, return ok(updated)
}
```

- `fail(code)` maps to a user message from `lib/errors.ts` — no ad-hoc strings.
- **Unexpected** errors (bugs, outages) still throw and reach the error boundary.
- The UI handles both branches explicitly; a toast for `ok: false` is the minimum.
- Route handlers use the same error codes and respond with `{ error: { code, message } }` and a matching HTTP status — for streaming handlers, see *Streaming and real-time*.

## Streaming and real-time

Pick the first option that fits:

| # | Situation | Use |
|---|---|---|
| 1 | Showing the status/progress of work that runs in **another** request (ingest, audio, guide) | **Polling** every 2s while anything is in progress; stop when nothing is. The work writes its current stage to the row (`progress` column), so the UI can show "Embedding 3/5" |
| 2 | Output produced **inside this request** (LLM tokens) | **HTTP stream** from a route handler with the AI SDK (`streamText` → UI message stream, `useChat` on the client) |
| 3 | Anything else (instant push, bidirectional, collaboration) | Not in scope. WebSockets can't run on Vercel functions; Supabase Realtime needs a decision record first |

Why not SSE for status: every Vercel invocation is isolated, so an SSE endpoint can't hear the ingest function — it would have to poll the database itself while holding a connection open. The database is the single source of truth; the client can read it directly.

**Rules for streaming route handlers:**

- `export const runtime = "nodejs"` (Supabase clients and PDF/TTS libraries need Node) and an explicit `export const maxDuration`
- Everything that can fail **before** the first byte — validation, auth, ownership, rate limits, global cap — happens before the stream starts and returns a normal JSON error with a status code
- Errors **during** the stream can't change the status code: map them through `lib/errors.ts` into the stream's error message (AI SDK `onError` / error mapping). Never forward raw provider errors
- Persist results in `onFinish`, and call `consumeStream()` on the result so `onFinish` still runs when the browser disconnects mid-answer (check the installed AI SDK version's API)
- Set `maxOutputTokens`; the stream length is part of the cost budget

**Rules for polling:**

- Poll only while something is `pending`/`processing`; no background polling on idle pages
- One lightweight query (status + progress columns only), scoped by RLS like any other read
- Give up with a readable message after a sane maximum (e.g. 5 minutes) and offer a retry

## TypeScript

- `strict` and `noUncheckedIndexedAccess` on. No `any` without a comment; no `@ts-ignore` (use `@ts-expect-error` with a reason if truly needed).
- **Types come from their source:** `z.infer<typeof Schema>` for I/O shapes, generated `Database` types for rows. Don't hand-write a type that a schema or the DB already defines.
- Discriminated unions over optional-field soup (`status: "ready" | "failed"` with per-status fields).
- No floating promises: `await` or explicitly `void` (ESLint `@typescript-eslint/no-floating-promises`).
- Import via the `@/` alias. **No barrel files** (`index.ts` re-exports) — they blur the server/client boundary and hurt tree-shaking.

## Naming

| Thing | Style | Example |
|---|---|---|
| Files, folders | kebab-case | `citation-chip.tsx`, `rate-limit.ts` |
| Components, types, Zod schemas | PascalCase | `CitationChip`, `SourceStatus`, `RenameNotebookInput` |
| Functions, variables | camelCase, verbs for functions | `retrieveChunks`, `sourceIds` |
| Booleans | `is`/`has`/`can` prefix | `isDemo`, `hasRelevantContext` |
| Constants | UPPER_SNAKE_CASE | `MAX_SOURCES_PER_NOTEBOOK` |
| Server actions | verb + noun | `createNotebook`, `deleteSource` |

## UI

- shadcn/ui + Tailwind; `cn()` for conditional classes; no custom CSS files unless unavoidable.
- Every async surface has **loading, empty and error** states. Buttons are disabled while pending.
- Accessibility basics: real `<button>`s and labels, keyboard reachable, visible focus, `aria-live` for streaming chat and status changes.
- Dates are stored as UTC `timestamptz` and formatted in the browser.

## Tests

- Two levels: **Vitest** unit tests for logic, **Playwright** E2E tests for user-visible behaviour (see below). No component-test layer — KISS.
- **Vitest unit tests for the pure core** (see `principles.md` §4): chunking, citation parsing, RRF, WAV encoding, rate-limit math, URL/IP validation, prompt assembly.
- Test behaviour, not implementation: inputs and outputs, no mocking of the function under test.
- **No real network or model calls in tests or CI.** Use the AI SDK's mock models (`ai/test`) where a model is involved.
- LLM output is non-deterministic: assert on structure and invariants (valid citations, schema-valid), never on exact wording.
- Test files sit next to the code: `chunk.ts` → `chunk.test.ts`. Fixtures under `test/fixtures/`, each under 200 KB.
- **Every fixed bug gets a regression test where feasible**, at the lowest level that reproduces it: Vitest for logic, pgTAP (`supabase/tests/`) for RLS, grants and triggers, Playwright for user-visible behaviour. Confirm it fails without the fix, then passes with it. If no test is feasible, say why in the commit or PR (e.g. a race that needs real provider timing). A fixed flaky test is its own regression test: the fix makes it deterministic, and the commit names the race it closed.

## E2E tests (Playwright)

- Tests live in `e2e/`, one file per feature (`notebooks.spec.ts`, `chat.spec.ts`, …). Every UI task adds its tests.
- Run against the **local stack** with `AI_PROVIDER=mock`. No real Gemini calls in E2E — answer quality is a human check.
- Each test gets a fresh browser context = a fresh anonymous user. No shared state between tests, no test order dependencies.
- Locate elements the way users do: `getByRole`, `getByLabel`, `getByText`. No CSS/XPath selectors; add `data-testid` only when nothing semantic exists.
- Web-first assertions (`await expect(locator).toBeVisible()`); never `waitForTimeout`.
- Include an axe check (`@axe-core/playwright`) on every page a task introduces.
- Security behaviour is tested, not assumed: isolation between users, no external image requests from rendered answers, limits.

## Comments and docs

- Comments explain **why**, not what. A comment that restates the code gets deleted.
- Public functions in `lib/` get a one-line doc comment if their name doesn't say it all.
- If implementation diverges from `docs/architecture.md`, update the doc in the same commit.
