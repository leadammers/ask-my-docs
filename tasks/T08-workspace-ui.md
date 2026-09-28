# T08 — Notebook workspace UI

**Mode:** agent+check · **Priority:** P0 · **Depends on:** T07, T08c · **Estimate:** 4.25h · **Your time:** 25 min

Demo seeding is **not** in this task — it moved to [T08c](T08c-demo-notebook.md), which runs first so this task can be built and reviewed against a real seeded notebook.

## Goal
The notebook page becomes a workspace: sources and chat side by side, checking sources changes what the next answer is grounded in, and clicking a citation opens the cited passage with the quoted line highlighted. **After T08 + T08b + T08c the MVP is submittable.**

The target is *not* a NotebookLM clone. NotebookLM gives Studio a permanent third column; here Studio is a later add-on (T09/T11/T12), and a third column would hold three "coming soon" cards while squeezing the chat — the actual product — to roughly 520px at 1280px. So: **two columns and one secondary surface**, a left-anchored drawer that covers the sources list for the duration.

Added after the spec was written (user request): **dark mode**. It is app-wide — the Tailwind tokens are global, and `globals.css` already carries the `.dark` palette — so it belongs here rather than in T14. The estimate was raised from 3.5h to cover the toggle, the wiring and the two-theme audit.

```text
+--------------------------------------------------------------+
| <- Notebooks   Jahresbericht 2026   [edit]       [Studio >]  |
+------------------+-------------------------------------------+
| SOURCES       +  |  +-- you ---------------------------+     |
| [x] report.pdf   |  | Was kostet die Wartung?           |     |
| [x] plan.md      |  +-----------------------------------+     |
| [ ] alt.pdf ...  |  +-- assistant ----------------------+     |
|                  |  | Die Wartung kostet 42.000 EUR [1] |     |
| 2 of 3 selected  |  +-----------------------------------+     |
|                  |                                           |
|                  |  ask your sources...        [stop] [ -> ]  |
+------------------+-------------------------------------------+
     click [1] -> +-- left drawer ----------------+
                  | report.pdf - page 12       [x] |
                  | "...Wartung: 42.000 EUR laut   |
                  |  Plan 2026..."  <- highlighted |
                  +--------------------------------+
```

## Your part
- Visual review on localhost: the sources column and its checked state, the cited-line highlight, the drawer's motion, and whether the left drawer feels wrong in use (it covers the source list while open — the alternative, a third column, was rejected above).
- Confirm the workspace still reads as *this* product rather than a NotebookLM screenshot: no Studio column, the citation is the centrepiece.
- **Dark-mode audit** on localhost — walk both themes across the pages you normally use. axe catches contrast on rendered text, but not a wrong-looking surface, a badge that stops reading as a badge, or the drawer's scrim. This is the part no test can judge.

## Context
- `conventions/code.md` (client/server boundary, no component-test layer — behaviour is covered by Playwright), `conventions/security.md` §3 (demo rows are never writable), §9 (no `dangerouslySetInnerHTML`)
- `docs/architecture.md` §3 (demo RLS), §4.3 (citations), §4.2/§4.1 for what retrieval expects
- `docs/decisions.md` D-13 (Playwright + mock provider per UI task), D-14 (poll, don't add realtime)
- **Already built — do not rebuild:** back link and static title (`app/n/[id]/page.tsx:123-131`); sources list with status badge, progress, page count, error text, retry and inline delete (`components/source-list.tsx`); 2s polling with a 5-minute give-up; Enter/Shift+Enter and the empty-chat text (`components/chat/chat.tsx`); the typing indicator (`components/chat/typing-indicator.tsx`); the demo read-only gate `canEdit = own && !is_demo` (`page.tsx:103`); the pre-upload Gemini notice (`components/source-upload.tsx:13-14`); the demo badge and card on the home page.
- **Installed and unused:** `components/ui/tabs.tsx`, `checkbox.tsx` — intended exactly here. There is **no** `sheet.tsx`: add it (`pnpm dlx shadcn@latest add sheet` — the allowlisted form, `.claude/settings.json`), or wrap the installed `dialog.tsx` if the registry is unreachable. Primitives are `@base-ui/react`, style `base-nova`.
- **Citations today are hover-only tooltips** with no `onClick` (`components/chat/citation-chip.tsx`) — the click behaviour is net-new.
- The citation payload already carries everything the viewer needs: `chunkId`, `sourceId`, `sourceTitle`, `pageFrom/pageTo`, `quote` (`lib/chat/citations.ts:3-11`, mirrored in `docs/architecture.md` §3).

## Scope
1. **Layout.** At ≥1024px a two-column grid inside the page: **Sources** (fixed ~260-280px) and **Chat** (remaining width, the reading column). Below 1024px the same two panels become `Tabs` (Sources | Chat) — must work, need not be pretty (`docs/scope.md` §5). The page owns the column heights; the chat column is the full available height, not the fixed `h-96` pane it is today.
2. **Sources panel.** Keep the existing list; add a `Checkbox` per source that is `ready` (others disabled), a "select all / none" control and a "2 of 3 selected" count. Selection is client state in the workspace, initialised to all ready sources, and passed to `Chat`'s transport body as `sourceIds` (today the page computes it server-side, `page.tsx:114-117`). A source that becomes `ready` while the selection is still "everything" is selected too; once the user has changed the selection, new sources arrive unchecked with the panel showing it. Never send more than `CHAT_MAX_SOURCE_IDS`.
3. **Chat panel.** `stop` from `useChat` behind a stop button while streaming (the Send button is disabled while busy, so a runaway answer cannot be cancelled today), auto-scroll to the newest content as tokens arrive, and a **suggested-questions slot** in the empty state: a prop the workspace passes `[]` to until T09 fills it. Keep Enter/Shift+Enter and the typing indicator.
4. **Source viewer (left drawer).** Clicking a citation chip opens a left-anchored drawer showing source title, page(s) and the **full chunk text** with the citation's `quote` highlighted. Chunk is fetched by `chunkId` through the user-scoped client (RLS; demo chunks are readable via T02's policies), with loading and not-found states. `CitationChip` becomes a real button: keyboard reachable, `aria-label` that names the source and page.
5. **Studio slot (same drawer).** A header button opens the same drawer with Studio content: three cards (Guide, Audio, Notes), each in a "coming soon" state. Define the seam — one card component taking title, description and body — so T09/T11/T12 replace the body without touching the drawer.
6. **Header.** Keep the back link; make the title editable inline, reusing `renameNotebook` from `app/(app)/actions.ts:41` (the home page's `notebook-card.tsx` already calls it — do not write a second rename action).
7. **States.** For each surface name what an empty, loading and error state shows — chat has its empty text and error toast already; sources need a "no sources yet" state with an Add PDF CTA and a skeleton while the first poll is in flight; the notebook page needs its not-found and error paths; the viewer needs both.
8. **Accessibility.** The drawer is labelled and traps focus while open; focus moves in on open and returns to the citation chip on close. Selection controls have accessible names ("Use report.pdf in chat"). axe clean at 1280px and 390px.
9. **Docs.** `docs/architecture.md` §8 — add `components/workspace/` and the drawer module, and **fix the stale layout line** at `docs/architecture.md:248`, which still reads `notebook: sources | chat | studio` (the permanent-Studio-column design rejected above); §8 already lists `supabase/seed/` and §4.3 already describes click-to-open citations, so those need no edit. Append a `proposed` decision to `docs/decisions.md` recording the two-column + left-drawer workspace and the rejection of a permanent Studio column, because T09/T11/T12 build into that seam.
10. **Dark mode.** `next-themes` is **already a direct dependency** (`components/ui/sonner.tsx:14` even calls `useTheme()`) — no new dependency, and none may be added. Mount one `ThemeProvider` in `app/layout.tsx` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) with `suppressHydrationWarning` on `<html>`; the `.dark` tokens already exist in `globals.css`, so this is wiring plus an audit, not a second palette. One shared `ThemeToggle` in each page's existing header row (home page, notebook workspace), with a `mounted` guard so server and first client render agree. Declare `color-scheme` per theme so native controls (scrollbars, the composer) match. Mounting the provider also **fixes an existing latent bug**: `sonner.tsx` has been calling `useTheme()` with no provider, so toasts could never follow the theme. Audit both themes over the surfaces this task touches *and* the existing ones (status badges, chat bubbles, citation chip, source list, drawer).

## Cut order (if the budget bites)
Narrow-width tabs first (the E2E assertion becomes "no horizontal overflow"), then the suggested-questions slot (T09 can add it with the questions). **The source viewer and source selection are not cut** — they are scope.md core items 4 and 5, and the citation click is the demo's best moment.

## Out of scope
- Guide, audio and notes implementations (T09/T11/T12) — placeholder bodies only.
- Seeding the demo notebook (T08c), the retention banner and footer (T08b), security headers and global skeletons (T14).
- Type icons stay as they are: every source is a PDF until T10 adds kinds, and one icon family (lucide, per `components.json`) is used throughout.

## Acceptance criteria
- [ ] At 1280px the sources column and the chat are visible together, the chat fills its column height, and clicking a long answer scrolls to its newest line; at 390px there is no horizontal overflow and both panels are reachable as tabs
- [ ] Unchecking the source that answers a question makes the next answer the not-in-sources refusal; re-checking it restores the cited answer (E2E, mock provider)
- [ ] Clicking a citation chip opens the drawer at the right chunk, the cited line is visibly highlighted, the page number and source title are shown, and closing returns focus to the chip
- [ ] The stop button aborts a stream: the streaming indicator disappears, the partial answer stays, and the input is usable again
- [ ] The demo notebook shows no add/delete/rename controls and its chat still works; an upload or delete attempt against it is refused (UI assertion plus T02's policy check in `T08c`)
- [ ] The title can be renamed in the header and the new title survives a reload
- [ ] axe reports no violations on the notebook page at 1280px and 390px, **in both themes**
- [ ] No console errors on the main flows (upload → ready → ask → cite)
- [ ] **Dark mode:** a toggle in the header switches the theme app-wide, the choice survives navigation and a reload, a first-time visitor follows the system preference, and both themes are axe-clean

## E2E tests (Playwright, `e2e/`)
- Citation chip click → drawer with the highlighted passage, page number and source title; Escape closes it and focus is back on the chip
- Selection: uncheck the answering source → refusal; re-check → cited answer
- Stop generation: hold the route open, click stop, the answer stops and the input re-enables
- Narrow width (390px): no horizontal overflow, panels reachable as tabs, chat still usable
- Demo notebook: read-only (no add/delete controls), chat returns a cited answer
- Empty and error states render (notebook without sources; failed source)
- Theme: the toggle flips `documentElement`'s class, the choice survives navigation and a reload, and it applies on a page other than the one it was flipped on (`/demo-login` has no toggle)
- axe at both widths, in both themes

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```
Manual: the workspace review described under *Your part*, on the local stack.

## Notes for the agent
- Selection lives in the client, but the route still validates it: `sourceIds` from the body are Zod-checked, capped, and re-scoped by RLS in `match_chunks` — the UI is not the enforcement point (`conventions/security.md` §3).
- A new `sourceIds` on the transport body only takes effect for the next message; that is the intended behaviour — an answer already streaming keeps the sources it started with.
- Reuse `ScrollArea` (`components/ui/scroll-area.tsx`) or a plain overflow container for the chat column; if you scroll with a ref, scroll on the streamed message's content, not on mount, and keep `motion-reduce` users in mind (jumping content, not a smooth animation).
- The drawer fetches a chunk the user may or may not own; a missing row must read as "not found", not as an error, so a demo chunk and an unowned chunk look identical from the outside.
- Chunk text is untrusted content rendered as text — never through `dangerouslySetInnerHTML`; the highlight is a mark around the `quote` offsets, not HTML from the model.
- There is no component-test layer by convention (`conventions/code.md`); anything worth unit-testing here (e.g. computing the highlight range inside the chunk) belongs in `lib/` as a pure function with a Vitest test.
- Do not add realtime/subscriptions for source status — polling stays (D-14).
