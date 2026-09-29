# T00 — Local tooling, accounts, keys

**Mode:** human · **Priority:** P0 · **Depends on:** — · **Estimate:** 1.25h · **Your time:** 1.25h

## Goal
Local tooling works, all external services exist, and every secret is in place — so agents never touch accounts, secrets or production.

## Your part
1. **Docker Desktop** (WSL 2 backend on Windows). Check with `docker run hello-world`.
2. **Supabase CLI** (e.g. `scoop install supabase` or `npm i -g supabase`). Check with `supabase --version`. The local stack is started in T02; the first `supabase start` downloads several images, so run it once now to warm the cache.
3. **Gemini:** create an API key in Google AI Studio. Note the current IDs of (a) a Flash chat model, (b) the embedding model (`gemini-embedding-001`), (c) the TTS model. Record the free-tier limits from AI Studio's rate-limit page below. **Make one test call** from AI Studio or `curl` to confirm the free tier works for your account and region.
4. **Supabase (hosted = production):** create a project in an EU region (e.g. Frankfurt). Enable **Anonymous sign-ins** (Authentication → Providers). Keep the URL, anon key and service-role key for Vercel only. Run `supabase login` and `supabase link --project-ref <ref>` in the repo — only you use the link (see `AGENTS.md`).
5. **Vercel:** import `leadammers/ask-my-docs`, framework Next.js, function region **Frankfurt (fra1)** next to Supabase. Add every variable from `.env.example` for Production and Preview, using the **hosted** Supabase values.
6. **Cloudflare Turnstile** (needs the Vercel domain from step 5): create a widget in *Managed* mode for the Vercel domain. Secret key → Supabase dashboard → Authentication → Attack Protection → CAPTCHA (Turnstile). Site key → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel. Locally, leave it empty: CAPTCHA is disabled in the local stack (T02) and the widget is skipped.
7. **GitHub:** enable Dependabot alerts and secret scanning in the repo settings.
8. **`.env.local`:** copy `.env.example`, fill in the Gemini values now. The Supabase values for local development come from `supabase status` in T02.
9. Commit and push the foundation (docs, conventions, tasks, `.claude/settings.json`, LICENSE) as the first commit.

## Acceptance criteria
- [x] `docker run hello-world` and `supabase --version` work
- [x] Gemini test call succeeded; model IDs and limits recorded below
- [x] Hosted Supabase: anonymous sign-in and Turnstile CAPTCHA enabled; CLI linked
- [x] Vercel project linked to the repo, region fra1, production env vars set
- [x] `.env.local` exists and is **not** tracked by git
- [x] Foundation pushed to `main`

## Recorded values
| Item | Value |
|---|---|
| Chat model ID | gemini-3.5-flash-lite |
| Embedding model ID | gemini-embedding-2 |
| TTS model ID | (deferred — see note) |
| Free-tier limits (RPM / RPD) chat | 10 RPM / 500 RPD / 100k TPM |
| Free-tier limits embeddings | 100 RPM / 1000 RPD / 30k TPM |
| Free-tier limits TTS | |
| Supabase region | |
