# T12 — Saved notes

**Mode:** hand-off · **Priority:** P4 · **Depends on:** T08 · **Estimate:** 1.25h — **first to cut** · **Your time:** 5 min (diff review)

## Goal
Users can pin a chat answer as a note (keeping its citations) and write their own notes in the Studio panel.

## Scope
- "Save to note" action on assistant messages → note with `origin = 'chat'`, content and citations copied
- "Add note" → manual note (title + markdown body)
- Notes list in the Studio panel: open, edit (manual notes only), delete
- Citation chips in saved notes still open the source viewer
- Not available on the demo notebook (read-only) — hide the actions there

## Acceptance criteria
- [ ] Saved answer keeps working citations after reload
- [ ] Manual notes can be created, edited, deleted
- [ ] Other users cannot read notes (RLS — covered by T02 policies, verify manually)

## E2E tests (Playwright, `e2e/`)
- Save an answer as a note → reload → note still there, citations open the source viewer
- Create, edit, delete a manual note
- Notes actions are hidden on the demo notebook

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```
