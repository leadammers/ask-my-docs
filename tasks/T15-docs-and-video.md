# T15 — README, architecture diagram, demo video

**Mode:** shared · **Priority:** P0 · **Depends on:** all · **Estimate:** 1.5h · **Your time:** 1.5h

## Goal
A visitor understands what was built, how, and why within 2 minutes of opening the repo — and the video shows it working live.

## Agent part
- Final `README.md`: one-line pitch, live link, video link, screenshot/GIF, features, architecture diagram (Mermaid), how it works (ingestion → retrieval → grounded answer), local setup in ≤ 6 commands, evaluation headline numbers with link, known limitations, what I'd do next
- Architecture diagram in Mermaid, consistent with `docs/architecture.md`
- Update `docs/architecture.md` wherever implementation diverged from the design
- Make sure `docs/ai-workflow.md` log is complete

## Your part
- Review the README for accuracy and tone
- While rehearsing: check the demo notebook's guide and audio content reads well (you'll show it)
- Record the demo video following the outline in `docs/scope.md` §7 (≤ 10 min) — rehearse the live test once; use the demo notebook plus one fresh upload
- Add the video link to the README
- Final check in a fresh incognito window on the production URL

## Acceptance criteria
- [ ] Every link in the README works
- [ ] Local setup instructions work from a clean clone
- [ ] Video ≤ 10 minutes, includes a live test
- [ ] Supabase project not paused; keep it active while the demo is live
