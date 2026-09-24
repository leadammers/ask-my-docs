# Scope

**Project:** ask-my-docs — a NotebookLM clone
**Context:** take-home task for a job application. Deliverables: GitHub repo, live deployment, Loom video (max. 10 min) explaining the approach and testing the clone live.
**Time budget:** ~1 week of evenings, ~18-22 focused hours, agent-assisted.
**Last updated:** 2026-09-22

---

## 1. What "done" means for this submission

The reviewers will judge three things, in this order:

1. **Does it work live?** They will click the deployment link. First load must be fast, no login wall, no broken states.
2. **How did she approach it?** The task says AI tools are explicitly wanted and they want to *see how she works*. The repo itself — scope, decisions, task files, agent instructions, commit history — is evidence of the process. `docs/ai-workflow.md` makes that explicit.
3. **Is the engineering sound?** Grounded answers with real citations, sensible architecture, security awareness, some measurement of quality.

Everything below is prioritised against those three.

## 2. Core product (P0 — must ship)

A user can:

1. Open the app without signing up (anonymous session) and create a **notebook**.
2. Add **PDF sources** to the notebook.
3. See each source's processing status (processing / ready / failed).
4. **Chat with the notebook**: answers are grounded only in the sources, streamed, and carry **inline citations** `[1]` that show the exact passage (source title + page) on click/hover.
5. Select which sources the chat uses (checkboxes, as in NotebookLM).
6. Get an honest "not in your sources" answer when the sources don't cover the question.
7. Return later in the same browser and find their notebooks and chat history.

Plus: a **pre-seeded demo notebook** so a reviewer can try it in 10 seconds without uploading anything.

## 3. Extras (ordered by priority — build top-down, stop when time runs out)

The core RAG pipeline (P0: hybrid retrieval, grounded citations) is the main engineering achievement here, so evaluation and hardening (section 4) are treated as guaranteed parts of the MVP, not extras squeezed in afterwards. The extras below are then ordered by cost and risk rather than by how close they get to NotebookLM's own feature set.

| Priority | Feature | Why this position | Est. |
|---|---|---|---|
| P1 | **Notebook guide** — auto summary, key topics, suggested questions | Cheap, reuses the existing pipeline, visible payoff | 1h |
| P2 | **More source types** — pasted text, Markdown/TXT upload, web URL | Small, isolated ingestion adapters; makes the live demo more flexible | 1.5h |
| P3 | **Saved notes** — pin an answer (with its citations) as a note, write own notes | Small and low risk, rounds out the "notebook" feel | 1h |
| Stretch | **Audio overview** — two-host podcast-style summary via multi-speaker TTS | The most memorable demo moment, but the highest-risk build (preview TTS model, long generation). Only attempted once P0, evaluation and hardening are solid, strictly timeboxed at 3h, with a transcript-only fallback | 3h |
| Stretch | YouTube transcripts as a source | Only if everything above is done | — |

**Cut line:** evaluation (T13) and hardening (T14) are part of the MVP and are never cut. If behind schedule by day 4, drop the audio overview first, then saved notes (P3), then the URL source type from P2. A complete, evaluated and hardened P0 is a strong submission on its own; a P0 with several half-built extras around it is not.

## 4. Quality & engineering (non-feature scope)

| Item | Scope |
|---|---|
| Evaluation | Small, honest: ~15-20 questions over the demo notebook — retrieval hit rate, citation correctness, correct refusal on out-of-scope questions. Script + results table in `docs/evaluation.md`. |
| CI | Lint, typecheck, unit tests, build on every push (GitHub Actions). |
| Security | Row-level security on every table; uploads go straight to storage (never through the app server); per-user rate limits and upload caps; secrets only in env vars. |
| Privacy | The Gemini free tier may use submitted content to improve Google's products. The UI and README say so plainly: do not upload confidential documents. |
| Docs | README (what / how / run locally / architecture / limitations), architecture, decisions, evaluation, AI workflow. |

## 5. Explicitly out of scope

| Not doing | Reason |
|---|---|
| Real accounts (email/OAuth), sharing, collaboration | Anonymous sessions are enough for a demo; accounts add a login wall reviewers would hit |
| Multi-language UI / i18n | UI is English; answers follow the language of the question (German works) |
| Mobile-optimised layout | Desktop-first; must not break on mobile, but not designed for it |
| OCR for scanned PDFs | Text-layer PDFs only; scanned PDFs fail with a clear message |
| Python backend / separate API service | See `docs/decisions.md` D-02 |
| Paid APIs or paid hosting | €0 budget |

## 6. Schedule (agent-assisted estimates)

| Day | Target | Tasks |
|---|---|---|
| 1 | Docker + accounts, scaffold, local schema, **live URL exists** | T00-T03 |
| 2 | Provider layer + PDF ingestion | T04-T05 |
| 3 | Retrieval + grounded chat with citations | T06-T07 |
| 4 | Notebook UI polish → **MVP submittable** | T08 |
| 5 | Guide + more source types | T09-T10 |
| 6 | Evaluation + hardening (guaranteed) | T13-T14 |
| 7 | Notes, audio overview if time allows, README, Loom recording | T12, T11, T15 |

**Rule:** deploy from day 1 and keep `main` deployable. A late surprise in deployment is the most likely way to miss the deadline.

## 7. Loom video outline (≤ 10 min)

1. **0:00-1:00** — What I built and the constraints I set (1 week, €0, NotebookLM core first).
2. **1:00-3:00** — How I worked: scope → decisions → task files → agents implement task by task → I review. Show `tasks/`, `AGENTS.md`, a commit, one place where I corrected the agent.
3. **3:00-7:30** — Live test: demo notebook → upload a new PDF → ask questions → click citations → out-of-scope question gets refused → guide → audio overview → save a note.
4. **7:30-9:00** — Architecture in one diagram; evaluation results; known limitations.
5. **9:00-10:00** — What I would do next with more time.
