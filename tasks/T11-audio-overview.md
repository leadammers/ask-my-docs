# T11 — Audio overview (timeboxed: 3h)

**Mode:** shared · **Priority:** P3 · **Depends on:** T09 · **Estimate:** 3h — **hard stop** · **Your time:** 30 min

## Goal
From the Studio panel, generate a 2-3 minute two-host, podcast-style audio summary of the notebook, with a player and transcript.

## Your part
- **Listen** to the first generated overview and pick the two voices (`AI_TTS_VOICE_HOST`, `AI_TTS_VOICE_GUEST`); judge whether the script sounds natural
- **Timebox call at 2h:** decide whether to continue or ship the transcript fallback
- Re-run the seed in production for the demo audio

## Context
`docs/architecture.md` §4.5. Gemini multi-speaker TTS supports **at most 2 speakers**, returns 24 kHz 16-bit mono PCM, and is a preview model — expect changes and rate limits.

## Scope
1. **Script** (`lib/studio/audio.ts`): `generateObject` → `{ title, turns: { speaker: "Host" | "Guest", text }[] }`, ~350-450 words, conversational, grounded in the notebook guide + top chunks; same language as the majority of sources
2. **Speech:** `@google/genai` with `AI_TTS_MODEL`, multi-speaker config mapping Host/Guest to two prebuilt voices from `AI_TTS_VOICE_HOST` / `AI_TTS_VOICE_GUEST`
2b. Add a `mock` TTS to `lib/ai/tts.ts` for `AI_PROVIDER=mock` (returns a short silent PCM buffer)
3. **WAV** (`lib/studio/wav.ts`, pure): PCM → WAV with a 44-byte header (24000 Hz, 16-bit, mono) — unit tested
4. Upload to bucket `audio` at `{userId}/{notebookId}/{id}.wav`; `audio_overviews` row with status `generating → ready | failed`
5. `POST /api/audio` with `maxDuration = 300`; writes `progress` (`script` → `speech` → `saving`); client polls status + progress
6. Studio card: "Generate audio overview" → progress state → `<audio>` player + collapsible transcript + regenerate
7. **Fallback:** if TTS fails, keep the script, set status `failed`, show the transcript with "Audio unavailable right now"
8. Precompute audio for the demo notebook in `seed-demo.ts`
9. Rate limit `RATE_LIMIT_AUDIO_PER_DAY` (default 3) per user, plus the global daily cap
10. Deleting a notebook also removes its audio files from Storage

## Timebox rule
If audio is not playing end-to-end after **2 hours**, stop, ship the transcript-only fallback as the feature, log it in `docs/ai-workflow.md`, and move on to T12. Do not let this task eat the evaluation.

## Acceptance criteria
- [ ] Demo notebook plays a pre-generated overview instantly
- [ ] A new notebook generates audio in under ~90s with two distinguishable voices
- [ ] WAV unit test: header fields and total length are correct for a known PCM buffer
- [ ] A forced TTS failure shows the transcript fallback, no crash

## E2E tests (Playwright, `e2e/`)
- With a mock TTS (short silent PCM): generate → player appears with transcript
- Mock TTS failure → transcript fallback with "Audio unavailable right now"

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```
