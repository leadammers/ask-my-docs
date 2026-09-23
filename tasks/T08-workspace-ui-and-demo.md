# T08 — Notebook workspace UI + demo notebook

**Mode:** shared · **Priority:** P0 · **Depends on:** T07 · **Estimate:** 1.75h · **Your time:** 45 min

## Goal
The notebook page looks and feels like a finished product, and a pre-seeded demo notebook lets a reviewer try everything in 10 seconds. **After this task the MVP is submittable.**

## Your part
- **Choose the demo documents** (collect them during T01-T07 so this task is not blocked): 2-3 openly licensed documents, one German, one English, with concrete facts and numbers you can ask about live in the video. Check the licences and put them in `supabase/seed/`.
- Visual review of the workspace on `localhost` — does it *look* right? (functional checks are automated)
- **Release to production:** `supabase db push`, push `main`, then `pnpm script scripts/seed-demo.ts` against production (with production env values)

## Scope
- Three-panel layout on desktop: **Sources** (left) | **Chat** (centre) | **Studio** (right; placeholder cards for Guide, Audio, Notes — "coming soon" until those tasks land)
- Sources panel: list with type icon, title, status, checkbox for chat selection (select all / none), add source button, delete in a menu
- **Source viewer:** clicking a citation chip opens the source's chunk text in the left panel (or a sheet), scrolled to and highlighting the cited chunk, with the page number
- Chat panel: suggested-question slot (filled in T09), input with Enter to send / Shift+Enter newline, stop-generation button, auto-scroll
- Responsive fallback: on narrow screens panels become tabs (must not break, doesn't need to be beautiful)
- Notebook title editable in the header; back link to the notebooks list
- Privacy notice in the footer/upload dialog: free tier, don't upload confidential documents
- **Demo notebook:** `scripts/seed-demo.ts` (service role) creates the **demo owner** auth user if missing, stores its id in `app_settings`, and creates one notebook owned by it with `is_demo = true`, uploads 2-3 public-domain / openly licensed documents from `supabase/seed/`, and runs the ingest pipeline on them. Demo notebook is read-only in the UI (no add/delete, chat allowed)
- Pick demo documents that make a good live test: one German, one English, with concrete facts and numbers. Record sources and licences in `supabase/seed/README.md`

## Out of scope
Guide, audio, notes implementations.

## Acceptance criteria
- [ ] Demo notebook opens from the home page; asking a suggested-style question returns a cited answer within ~5s of first token
- [ ] Clicking a citation shows the exact highlighted passage and page
- [ ] Empty, loading, and error states exist for sources, chat and the notebook list
- [ ] No console errors in the browser on the main flows
- [ ] Layout usable at 1280px and not broken at 390px width

## E2E tests (Playwright, `e2e/`)
- Clicking a citation opens the source viewer at the right chunk, highlighted, with the page number
- The demo notebook is read-only (no add or delete actions); chat works
- At 390px width: no horizontal overflow; panels are reachable as tabs
- Empty and error states render (e.g. notebook without sources)
- axe: no violations on the notebook page

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
pnpm script scripts/seed-demo.ts   # agent runs locally; production run is yours
```
Manual: full flow on the Vercel deployment in a fresh incognito window.
