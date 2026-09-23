# ask-my-docs

A NotebookLM clone: add your documents to a notebook and chat with them. Every answer is grounded in your sources and cites the exact passage it came from.

> **Status:** in development. See [tasks/README.md](tasks/README.md) for progress.

**Live demo:** _coming soon_ · **Video walkthrough:** _coming soon_

## Features

- Notebooks with PDF, text, Markdown and web-page sources
- Chat grounded only in your sources, with clickable citations down to the page
- Honest "not in your sources" answers instead of guesses
- Notebook guide: summary, key topics, suggested questions
- Audio overview: a two-host, podcast-style summary
- Saved notes

## Stack

Next.js (TypeScript) on Vercel · Supabase (Postgres + pgvector, Storage, Auth) · Gemini API via the Vercel AI SDK

## Documentation

| | |
|---|---|
| [Scope](docs/scope.md) | What is built, what isn't, and in which order |
| [Architecture](docs/architecture.md) | Data model, ingestion, retrieval, citations, audio |
| [Decisions](docs/decisions.md) | Why the system looks the way it does |
| [Conventions](conventions/README.md) | Principles, security rules, code standards |
| [AI workflow](docs/ai-workflow.md) | How AI coding agents were used to build it |
| [Tasks](tasks/README.md) | The task-by-task implementation plan |

## Privacy note

The live demo uses the Gemini API free tier, under which Google may use submitted content to improve its products. **Do not upload confidential documents.**

## License

MIT — see [LICENSE](LICENSE).
