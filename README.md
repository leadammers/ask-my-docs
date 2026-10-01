# ask-my-docs

A [NotebookLM](https://notebooklm.google/)–style app for adding documents to notebooks and having conversations grounded entirely in your sources, with citations pointing back to the exact passage behind each answer.

> 🚧 **Status:** In development — PDF sources, grounded chat with citations and the notebook workspace are built; the notebook guide, more source types, saved notes and the audio overview are still planned.
>
> See the [implementation plan](tasks/README.md) for current progress.

**Live demo:** [ask-my-docs-demo.vercel.app](https://ask-my-docs-demo.vercel.app) · 🔐 Password required ([request access](mailto:github.negative013@passinbox.com?subject=ask-my-docs%20demo%20access%20request&body=Hi%2C%0A%0AI%27d%20like%20to%20try%20the%20ask-my-docs%20demo%20%28https%3A//ask-my-docs-demo.vercel.app%29.%20Could%20you%20send%20me%20the%20demo%20password%3F%0A%0AName%20/%20company%20%28optional%29%3A%0A%0AThanks%21))

The demo sits behind a shared password so that a public URL cannot burn through the free AI quota. The password buys a database-side entitlement (valid 8 hours), not just a cookie, so the notebook data is not reachable around the app either ([D-16](docs/decisions.md), [D-21](docs/decisions.md)).

---

### ✨ Features

| | Feature | State |
|---|---|---|
| 📚 | **Document notebooks** — upload PDFs (text-layer only, no OCR) | Built |
| 💬 | **Grounded chat** — answers are generated only from your sources, streamed | Built |
| 🔗 | **Precise citations** — numbered, validated against the retrieved passages | Built |
| 🚫 | **No guessing** — says so when the sources don't cover the question | Built |
| 🔎 | **Hybrid retrieval** — vector + full-text search fused with RRF | Built |
| 🧭 | **Notebook guide** — summary, key topics, suggested questions | Planned (T09) |
| 🌐 | **More sources** — pasted text, Markdown, web pages | Planned (T10) |
| 📝 | **Saved notes** — keep useful answers next to your sources | Planned (T12) |
| 🎧 | **Audio overview** — two-host, podcast-style summary | Stretch (T11) |

---

### 🛠️ Stack

| Layer          | Technology                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| App            | <img src="https://cdn.simpleicons.org/nextdotjs" width="18" alt="Next.js" /> **Next.js** · TypeScript             |
| Hosting        | <img src="https://cdn.simpleicons.org/vercel" width="18" alt="Vercel" /> **Vercel**                               |
| Database       | <img src="https://cdn.simpleicons.org/supabase" width="18" alt="Supabase" /> **Supabase** · PostgreSQL · pgvector |
| Storage & Auth | <img src="https://cdn.simpleicons.org/supabase" width="18" alt="Supabase" /> **Supabase**                         |
| AI             | <img src="https://cdn.simpleicons.org/googlegemini" width="18" alt="Gemini" /> **Gemini API** · Vercel AI SDK     |

---

### 🚀 Run locally

Needs Node 22, pnpm (`corepack enable`), Docker and the Supabase CLI. Development runs against a **local** Supabase stack; the hosted project is only touched by the release steps in [tasks/README.md](tasks/README.md).

```bash
pnpm install
cp .env.example .env.local   # fill in the Gemini key, or set AI_PROVIDER=mock
pnpm db:start                # local Supabase in Docker
pnpm dev                     # http://localhost:3000
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:test` (pgTAP), `pnpm test:e2e` (Playwright; see [AGENTS.md](AGENTS.md) for the env it needs).

---

### 🔁 CI and deployment

GitHub Actions is the **only** thing that deploys; the Vercel Git integration is disconnected ([D-23](docs/decisions.md)). Work lands on `dev`, and `main` only moves through a reviewed merge from `dev` ([D-22](docs/decisions.md)).

| Event | What runs |
|---|---|
| Pull request | lint, typecheck, unit, integration, pgTAP, build, Playwright e2e, secret and dependency scans, then a **preview** deployment (not for `dev`/`main` heads or Dependabot) |
| Push to `dev` | the same checks, then a deployment to the dev alias |
| Push to `main` | the same checks, then a **production** deployment |
| PR merged | `preview-cleanup` deletes that branch's preview deployments (production and aliased deployments are never touched) |

---

### 📖 Documentation

| Document                             | Description                                            |
| ------------------------------------ | ------------------------------------------------------ |
| [Scope](docs/scope.md)               | What is built, what isn't, and in which order          |
| [Architecture](docs/architecture.md) | Data model, ingestion, retrieval, citations, and audio |
| [Decisions](docs/decisions.md)       | Why the system is designed the way it is               |
| [Conventions](conventions/README.md) | Principles, security rules, and code standards         |
| [AI workflow](docs/ai-workflow.md)   | How AI coding agents were used to build it             |
| [Tasks](tasks/README.md)             | The task-by-task implementation plan                   |

---

### 🔒 Privacy

The live demo uses the **Gemini API free tier**. Under Google's terms for that tier, submitted content may be used to improve Google's products.

**Please do not upload confidential or sensitive documents.**

Your notebooks are tied to an anonymous session in your browser. Anonymous users with no visit for **30 days** are deleted automatically, with all their notebooks, sources and files (daily cleanup job).

### ⚠️ Known limitations

- PDFs with a text layer only — scanned documents fail with a clear message (no OCR).
- The demo runs on free tiers (Gemini quota, Supabase, Vercel): a global daily cap on AI calls protects the quota, and the demo shows a friendly notice once it is reached.
- The password-login rate limit is per server instance, not global — accepted because the password is a shared review secret ([security.md §7](conventions/security.md)).
- Server-side URL fetching (planned) accepts the residual risk of DNS rebinding between check and connect.

---

### 📄 License

MIT — see [LICENSE](LICENSE).
