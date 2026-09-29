import 'server-only';
import { z } from 'zod';

const serverShape = z.object({
  DEMO_PASSWORD: z.string().min(1),
  DEMO_COOKIE_SECRET: z.string().min(32),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  AI_PROVIDER: z.enum(['google', 'openai-compatible', 'ollama', 'mock']),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  AI_CHAT_MODEL: z.string().min(1),
  AI_EMBEDDING_MODEL: z.string().min(1),
  AI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  AI_TTS_MODEL: z.string().optional(),
  AI_TTS_VOICE_HOST: z.string().optional(),
  AI_TTS_VOICE_GUEST: z.string().optional(),
  MIN_VECTOR_SIMILARITY: z.coerce.number().min(0).max(1),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OPENAI_COMPATIBLE_BASE_URL: z.string().url().optional(),
  OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  // Vercel Cron sends it as a bearer token to /api/cron/retention (T08b).
  CRON_SECRET: z.string().min(16).optional(),

  AI_GLOBAL_DAILY_CAP: z.coerce.number().int().positive(),
  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().int().positive(),
  RATE_LIMIT_INGEST_PER_HOUR: z.coerce.number().int().positive(),
  RATE_LIMIT_AUDIO_PER_DAY: z.coerce.number().int().positive(),
  MAX_UPLOAD_MB: z.coerce.number().int().positive(),
  MAX_SOURCES_PER_NOTEBOOK: z.coerce.number().int().positive(),
});

type ServerValues = z.infer<typeof serverShape>;

const serverSchema = serverShape
  // The mock provider answers with canned text and fake embeddings; it exists
  // for E2E/CI only and must never serve the live app (conventions/ai.md).
  .refine(
    (value: ServerValues): boolean =>
      !(value.AI_PROVIDER === 'mock' && value.VERCEL_ENV === 'production'),
    {
      message: 'AI_PROVIDER=mock is not allowed in Vercel production',
      path: ['AI_PROVIDER'],
    },
  )
  // Vercel Cron authenticates with this bearer token and runs in production
  // only. Without it every cron run 401s and retention silently never happens
  // (T08b) — a misconfiguration that shows up as "nothing was deleted".
  .refine(
    (value: ServerValues): boolean =>
      value.VERCEL_ENV !== 'production' || Boolean(value.CRON_SECRET),
    {
      message: 'CRON_SECRET is required in Vercel production',
      path: ['CRON_SECRET'],
    },
  )
  .refine(
    (value: ServerValues): boolean =>
      value.AI_PROVIDER !== 'google' || Boolean(value.GOOGLE_GENERATIVE_AI_API_KEY),
    {
      message: 'GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER=google',
      path: ['GOOGLE_GENERATIVE_AI_API_KEY'],
    },
  )
  .refine(
    (value: ServerValues): boolean =>
      value.AI_PROVIDER !== 'ollama' || Boolean(value.OLLAMA_BASE_URL),
    {
      message: 'OLLAMA_BASE_URL is required when AI_PROVIDER=ollama',
      path: ['OLLAMA_BASE_URL'],
    },
  )
  .refine(
    (value: ServerValues): boolean =>
      value.AI_PROVIDER !== 'openai-compatible' || Boolean(value.OPENAI_COMPATIBLE_BASE_URL),
    {
      message: 'OPENAI_COMPATIBLE_BASE_URL is required when AI_PROVIDER=openai-compatible',
      path: ['OPENAI_COMPATIBLE_BASE_URL'],
    },
  );

const publicShape = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
});

type PublicValues = z.infer<typeof publicShape>;

const publicSchema = publicShape
  // The site key is optional only for local dev (auth-gate.tsx skips the
  // widget when it's empty). A missing or misnamed Vercel env var must fail
  // the build, not silently ship anonymous sign-in with no CAPTCHA.
  .refine(
    (value: PublicValues): boolean =>
      process.env.NODE_ENV !== 'production' || !!value.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    {
      message: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY is required in production',
      path: ['NEXT_PUBLIC_TURNSTILE_SITE_KEY'],
    },
  );

type ServerEnv = z.infer<typeof serverSchema>;
type PublicEnv = z.infer<typeof publicSchema>;
export type Env = ServerEnv & PublicEnv;

function formatIssues(label: string, issues: z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => `${label}: ${issue.path.join('.')} — ${issue.message}`);
}

// Parses each variable on its own and keeps only the ones that are valid.
// Used when validation is skipped: `vercel build` in CI sees placeholders for
// sensitive values, which must not fail the build (the real values are
// validated at runtime), while valid values still come out typed.
function parseLenient(shape: z.ZodObject, input: Record<string, unknown>): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(shape.shape)) {
    if (!(key in input)) continue;
    const result = (field as z.ZodType).safeParse(input[key]);
    if (result.success) parsed[key] = result.data;
  }
  return parsed;
}

function loadEnv(): Env {
  // A variable defined but left blank (Vercel UI, `KEY=` in .env files) means
  // "not set": without this, an empty optional value like OLLAMA_BASE_URL still
  // has to pass .url() and takes the whole app down at import time.
  const source = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== ''),
  );

  // CI and unit tests run without real secrets: nothing is required, but values
  // that are set and valid are still parsed, so numbers are numbers there too.
  if (process.env.SKIP_ENV_VALIDATION === '1') {
    return { ...parseLenient(serverShape, source), ...parseLenient(publicShape, source) } as Env;
  }

  const server = serverSchema.safeParse(source);
  const client = publicSchema.safeParse(source);

  if (!server.success || !client.success) {
    const problems = [
      ...(server.success ? [] : formatIssues('server', server.error.issues)),
      ...(client.success ? [] : formatIssues('public', client.error.issues)),
    ];
    throw new Error(`Invalid or missing environment variables:\n${problems.join('\n')}`);
  }

  return { ...server.data, ...client.data };
}

export const env = loadEnv();
