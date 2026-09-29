# ask-my-docs

A [NotebookLM](https://notebooklm.google/)–style app for adding documents to notebooks and having conversations grounded entirely in your sources, with citations pointing back to the exact passage behind each answer.

> 🚧 **Status:** In development
> 
> See the [implementation plan](tasks/README.md) for current progress.

**Live demo:** [ask-my-docs](YOUR_DEMO_URL) · 🔐 Password required ([request access](YOUR_ACCESS_REQUEST_LINK))

---

### ✨ Features

* 📚 **Document notebooks** — Upload PDFs, text, Markdown, and web pages
* 💬 **Grounded chat** — Answers are generated only from your sources
* 🔗 **Precise citations** — Jump directly to the cited page and passage
* 🚫 **No guessing** — Clearly says when an answer isn't supported by your sources
* 🧭 **Notebook guide** — Get summaries, key topics, and suggested questions
* 🎧 **Audio overview** — Turn your notebook into a two-host, podcast-style summary
* 📝 **Saved notes** — Keep useful insights alongside your sources

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

---

### 📄 License

MIT — see [LICENSE](LICENSE).
