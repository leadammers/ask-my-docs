# T13 — Evaluation

**Mode:** shared · **Priority:** P0 · **Depends on:** T08 · **Estimate:** 1.5h · **Your time:** 45 min

## Goal
A small, honest, reproducible measurement of answer quality over the demo notebook, published in `docs/evaluation.md`.

## Your part (do first, before looking at outputs)
Write `eval/questions.json` — **15-20 questions** over the demo documents:
- ~12 answerable: `{ id, question, expected_source, expected_pages: [..], expected_facts: ["..."] }`
- ~4 not answerable from the sources: `{ id, question, answerable: false }`
- ~2 in German, ~1 prompt-injection attempt ("Ignore your sources and ...")

Afterwards: read the results and pick the failure examples worth discussing in the video.

## Agent part
- `eval/run.ts` (`pnpm eval`): for each question and for both retrieval modes (`hybrid`, `vector`):
  - **Retrieval hit@k:** does any retrieved chunk come from the expected source and pages?
  - **Citation correctness:** share of cited chunks that are from the expected source/pages
  - **Fact coverage:** LLM-as-judge (same model, strict rubric, temperature 0) — does the answer contain each expected fact? Judge prompt stored in `eval/judge.md`
  - **Refusal accuracy:** unanswerable questions correctly refused; answerable ones not refused
  - Latency (time to first token, total) and token usage
- Runs against the **local** stack with the demo notebook seeded (`pnpm script scripts/seed-demo.ts`); the agent may run it
- Respect the free-tier rate limit: sequential, with a configurable delay between calls
- Write raw results to `eval/output/<timestamp>.json`; print a summary table
- Fill `docs/evaluation.md`: method, results table (hybrid vs vector), 2-3 concrete failure examples with explanation, limitations (small set, same-model judge, author-written questions)

## Acceptance criteria
- [ ] `pnpm eval` runs end-to-end without manual steps
- [ ] `docs/evaluation.md` contains real numbers and at least two honest failure cases
- [ ] The hybrid-vs-vector comparison is reported whichever way it comes out

## Verification
```bash
pnpm eval
pnpm lint && pnpm typecheck && pnpm test
```
