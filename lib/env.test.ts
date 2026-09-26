import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'AI_PROVIDER',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'AI_CHAT_MODEL',
  'AI_EMBEDDING_MODEL',
  'AI_EMBEDDING_DIMENSIONS',
  'MIN_VECTOR_SIMILARITY',
  'AI_GLOBAL_DAILY_CAP',
  'RATE_LIMIT_CHAT_PER_MIN',
  'RATE_LIMIT_INGEST_PER_HOUR',
  'RATE_LIMIT_AUDIO_PER_DAY',
  'MAX_UPLOAD_MB',
  'MAX_SOURCES_PER_NOTEBOOK',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

describe('env', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const key of REQUIRED_KEYS) {
      delete process.env[key];
    }
    delete process.env.SKIP_ENV_VALIDATION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws naming a missing variable when required vars are absent', async () => {
    await expect(import('@/lib/env')).rejects.toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it('does not throw when SKIP_ENV_VALIDATION=1 is set', async () => {
    process.env.SKIP_ENV_VALIDATION = '1';
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });
});
