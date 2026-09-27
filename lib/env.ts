import 'server-only';
import { z } from 'zod';

const serverSchema = z
  .object({
    DEMO_PASSWORD: z.string().min(1),
    DEMO_COOKIE_SECRET: z.string().min(32),

    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    AI_PROVIDER: z.enum(['google', 'openai-compatible', 'ollama', 'mock']),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
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

    AI_GLOBAL_DAILY_CAP: z.coerce.number().int().positive(),
    RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().int().positive(),
    RATE_LIMIT_INGEST_PER_HOUR: z.coerce.number().int().positive(),
    RATE_LIMIT_AUDIO_PER_DAY: z.coerce.number().int().positive(),
    MAX_UPLOAD_MB: z.coerce.number().int().positive(),
    MAX_SOURCES_PER_NOTEBOOK: z.coerce.number().int().positive(),
  })
  // The mock provider answers with canned text and fake embeddings; it exists
  // for E2E/CI only and must never serve the live app (conventions/ai.md).
  .refine((value) => !(value.AI_PROVIDER === 'mock' && value.VERCEL_ENV === 'production'), {
    message: 'AI_PROVIDER=mock is not allowed in Vercel production',
    path: ['AI_PROVIDER'],
  })
  .refine((value) => value.AI_PROVIDER !== 'ollama' || !!value.OLLAMA_BASE_URL, {
    message: 'OLLAMA_BASE_URL is required when AI_PROVIDER=ollama',
    path: ['OLLAMA_BASE_URL'],
  })
  .refine(
    (value) => value.AI_PROVIDER !== 'openai-compatible' || !!value.OPENAI_COMPATIBLE_BASE_URL,
    {
      message: 'OPENAI_COMPATIBLE_BASE_URL is required when AI_PROVIDER=openai-compatible',
      path: ['OPENAI_COMPATIBLE_BASE_URL'],
    },
  );

const publicSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  })
  // The site key is optional only for local dev (auth-gate.tsx skips the
  // widget when it's empty). A missing or misnamed Vercel env var must fail
  // the build, not silently ship anonymous sign-in with no CAPTCHA.
  .refine(
    (value) => process.env.NODE_ENV !== 'production' || !!value.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
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

function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION === '1') {
    return process.env as unknown as Env;
  }

  // A variable defined but left blank (Vercel UI, `KEY=` in .env files) means
  // "not set": without this, an empty optional value like OLLAMA_BASE_URL still
  // has to pass .url() and takes the whole app down at import time.
  const source = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== ''),
  );

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
