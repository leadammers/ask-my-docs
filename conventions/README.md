# Conventions

How code in this repository is written. Binding for humans and agents.

| File | Read when | Always loaded by agents |
|---|---|---|
| [principles.md](principles.md) | Always | yes |
| [security.md](security.md) | Always | yes |
| [code.md](code.md) | Writing TypeScript, React, server actions, route handlers, tests | no — read before coding |
| [database.md](database.md) | Writing migrations, SQL functions, queries, storage access | no — read before touching `supabase/` or queries |
| [ai.md](ai.md) | Calling models, writing prompts, embeddings, TTS | no — read before touching `lib/ai`, `lib/chat`, `lib/studio` |

## Priority order when rules conflict

1. **Security**
2. **Correctness**
3. **Simplicity** (KISS)
4. **No duplicated knowledge** (DRY)
5. Everything else (performance, elegance, consistency)

Example: if removing duplication would merge two authorization checks into one clever helper that is harder to audit, keep the two plain checks. Security and readability beat DRY.

## Why these conventions look like this

They are written for *this* architecture (see `docs/architecture.md`): one Next.js app on Vercel, Supabase with RLS as the access-control layer, anonymous users, a public URL, and a free-tier LLM quota. A different architecture — separate backend, real accounts, a paid provider — would need different rules. When the architecture changes, these files change with it.
