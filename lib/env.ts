import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  DEMO_PASSWORD: z.string().min(1),
  DEMO_COOKIE_SECRET: z.string().min(32),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  AI_PROVIDER: z.enum(["google", "openai-compatible", "ollama", "mock"]),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  AI_CHAT_MODEL: z.string().min(1),
  AI_EMBEDDING_MODEL: z.string().min(1),
  AI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  AI_TTS_MODEL: z.string().optional(),
  AI_TTS_VOICE_HOST: z.string().optional(),
  AI_TTS_VOICE_GUEST: z.string().optional(),
  MIN_VECTOR_SIMILARITY: z.coerce.number().min(0).max(1),
  OLLAMA_BASE_URL: z.string().url().optional(),

  AI_GLOBAL_DAILY_CAP: z.coerce.number().int().positive(),
  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().int().positive(),
  RATE_LIMIT_INGEST_PER_HOUR: z.coerce.number().int().positive(),
  RATE_LIMIT_AUDIO_PER_DAY: z.coerce.number().int().positive(),
  MAX_UPLOAD_MB: z.coerce.number().int().positive(),
  MAX_SOURCES_PER_NOTEBOOK: z.coerce.number().int().positive(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type PublicEnv = z.infer<typeof publicSchema>;
export type Env = ServerEnv & PublicEnv;

function formatIssues(label: string, issues: z.core.$ZodIssue[]): string[] {
  return issues.map(
    (issue) => `${label}: ${issue.path.join(".")} — ${issue.message}`,
  );
}

function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    return process.env as unknown as Env;
  }

  const server = serverSchema.safeParse(process.env);
  const client = publicSchema.safeParse(process.env);

  if (!server.success || !client.success) {
    const problems = [
      ...(server.success ? [] : formatIssues("server", server.error.issues)),
      ...(client.success ? [] : formatIssues("public", client.error.issues)),
    ];
    throw new Error(
      `Invalid or missing environment variables:\n${problems.join("\n")}`,
    );
  }

  return { ...server.data, ...client.data };
}

export const env = loadEnv();
