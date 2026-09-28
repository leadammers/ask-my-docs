# T14 — Hardening and polish

**Mode:** agent+check · **Priority:** P0 · **Depends on:** T08 · **Estimate:** 1.25h · **Your time:** 20 min

## Goal
The deployed app survives a skeptical reviewer: no broken states, clear limits, no obvious security holes.

## Your part
Lighthouse in Chrome DevTools on the production notebook page; a final skeptical click-through in an incognito window.

## Scope
- Follow-up from T05: `lib/ingest/pipeline.ts` embeds every chunk of a source with no upper bound (PDFs are capped at 300 pages, but a dense 300-page PDF can still mean hundreds of chunks). Decide and add a per-source chunk/char cap so one large upload can't burn a large share of the free-tier embedding quota; fail with a readable error code above it.
- Run the review checklist from `conventions/security.md` over every server action, route handler and SQL function — produce the filled-in table in the commit description
- Check that no service-role usage is reachable from user input without an ownership check
- Security headers in `next.config` (CSP allowing Supabase, Turnstile (`challenges.cloudflare.com` for script and frame) and self, `img-src 'self' data: blob:`, `media-src` and `connect-src` including the Supabase URL (audio playback, direct uploads) — build the Supabase origin from env so local and production both work, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`)
- Friendly messages for: quota exhausted, rate limited, source failed, notebook not found, network error
- 404 and error boundary pages
- Loading skeletons everywhere data loads; disable buttons during pending actions
- Extend axe E2E checks to every page; Lighthouse on the notebook page: fix anything below 90 in Accessibility and Best Practices
- Verify the privacy notice is visible before the first upload
- Remove dead code, TODOs, debug logs

## Acceptance criteria
- [ ] Security checklist filled in for every entry point, no open items
- [ ] Deleting a notebook leaves no objects in Storage (check the bucket)
- [ ] Lighthouse Accessibility and Best Practices ≥ 90
- [ ] E2E: 11 chat requests within a minute → the 11th shows the clear rate-limit message (low limit set via env in the test run)
- [ ] No `console.log` left outside the structured logger

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
grep -rn "console.log" app lib components | grep -v logger || true
```
