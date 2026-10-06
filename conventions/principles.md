# Principles

Four principles, in the priority order from `README.md`. When in doubt, ask: *what is the simplest thing that is secure and correct?*

---

## 1. KISS — Keep It Simple

The scope is small and the time budget tight. Every moving part must earn its place.

**In this project that means:**

| Do | Instead of |
|---|---|
| Server actions for mutations | A REST layer for everything |
| Route handlers only for streaming (chat), long-running work (ingest, audio) | Route handlers by default |
| Ingestion runs inside the request (`maxDuration = 300`) | A job queue or background worker |
| Poll status every 2s, with a progress stage stored on the row | SSE endpoints or Supabase Realtime (see `code.md`, *Streaming and real-time*) |
| `supabase-js` + SQL functions (`rpc`) | An ORM |
| React Server Components + `useChat` for chat state | A global state library |
| One Postgres for data, vectors and full-text | A separate vector database |
| Plain functions and modules | Classes, dependency-injection containers, design-pattern scaffolding |

**Rules of thumb:**

- If a solution needs a diagram to explain, look for a simpler one first.
- Prefer explicit over clever. Readable code beats short code.
- A function does one thing; a file stays under ~250 lines.
- Delete code instead of commenting it out — git remembers.
- No abstraction without a second real use (see DRY).

## 2. DRY — Don't Repeat Yourself

DRY is about **knowledge**, not about lines that happen to look alike. Every fact in the system has exactly one home.

**Single sources of truth in this project:**

| Knowledge | Lives in | Everything else |
|---|---|---|
| Env vars and their validation | `lib/env.ts` | imports `env` |
| Limits (upload size, source count, rate limits, caps) | `lib/env.ts` / `lib/config.ts` | imports the constant |
| Database types | `lib/supabase/types.ts` (generated) | never hand-written |
| Request/response and LLM output shapes | Zod schemas | types via `z.infer<>` |
| Model IDs | env vars | never in code |
| Prompts | `lib/<feature>/prompts.ts` | imported, never inlined |
| Ingestion flow | `lib/ingest/pipeline.ts` | source types are adapters, not copies of the pipeline |
| Citation rendering | one `CitationChip` component | used by chat and notes |
| User-facing error messages | `lib/errors.ts` | mapped, never ad hoc strings |

**Rule of three:** duplicate once if you must; on the third occurrence, extract. Two similar-looking UI components are not yet a pattern.

**Don't DRY:** authorization checks (each entry point checks explicitly — see `security.md`), tests (explicit and readable beats clever fixtures), and code that only *looks* alike but changes for different reasons.

## 3. Use the platform

Before writing something, check whether Next.js, React, Supabase, the AI SDK, Zod or shadcn/ui already does it.

- Access control → **RLS**, not hand-rolled filters alone
- Auth sessions → `@supabase/ssr`, not custom cookies
- Streaming chat → AI SDK `streamText` / `useChat`, not custom SSE
- Structured LLM output → `generateObject` + Zod, not regex over free text
- Forms and pending states → server actions + `useActionState` / `useFormStatus`
- UI primitives → shadcn/ui, not custom components
- Full-text search → Postgres `tsvector`, not a JS search library

Adding a dependency needs a reason: it removes significant code, it is well maintained, and nothing already installed covers it. Ask before adding one (see `AGENTS.md`).

## 4. Pure core, thin I/O shell

Logic that decides things is pure: no database, no network, no `Date.now()`, no env reads. Code that talks to the outside world only orchestrates.

```text
route handler / server action     thin: validate -> authorize -> call core -> persist -> respond
        |
lib/**/<logic>.ts                 pure: input in, output out, unit tested
```

Pure and unit-tested in this project: chunking, citation parsing, RRF fusion, WAV encoding, rate-limit window math, URL/IP validation, prompt assembly, source fingerprinting.

This is what makes a small project testable: the risky logic is covered by fast tests, and the I/O shell stays too thin to hide bugs.
