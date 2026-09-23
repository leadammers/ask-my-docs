# T10 — Text, Markdown and URL sources

**Mode:** hand-off · **Priority:** P2 · **Depends on:** T08 · **Estimate:** 1.75h · **Your time:** 5 min (diff review)

## Goal
Besides PDFs, users can add pasted text, `.md`/`.txt` files and web pages as sources, all flowing through the same pipeline.

## Context
`docs/architecture.md` §4.1 — one adapter per kind, shared chunk/embed/store.

## Scope
- "Add source" dialog with tabs: **Upload file** (PDF, MD, TXT) · **Paste text** · **Website URL**
- `adapters/text.ts`: pasted text (title required, max 200k chars) and `.txt`
- `adapters/markdown.ts`: strip Markdown syntax for embedding but keep headings as paragraph boundaries
- `adapters/url.ts`: server-side fetch with 10s timeout and 5 MB cap, only `http(s)`, **block private/loopback IP ranges** (SSRF), `@mozilla/readability` + `linkedom` to extract the article; title from the page; fail readably for JS-only pages
- Non-paged sources store everything as page 1; citations show the source title without a page number
- Order inside the task: text + markdown first, URL last (URL is the first thing cut if short on time)

## Out of scope
YouTube, Google Docs, audio files.

## Acceptance criteria
- [ ] Each type becomes `ready` and can be cited in chat
- [ ] `http://localhost`, `http://169.254.169.254`, `http://10.0.0.1` are rejected by the URL adapter (unit tests)
- [ ] A page that needs JavaScript fails with a readable message

## E2E tests (Playwright, `e2e/`)
- Paste text → source `ready`, citable in chat
- Upload a `.md` file → `ready`
- Entering `http://localhost` as URL shows the rejection message

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```
