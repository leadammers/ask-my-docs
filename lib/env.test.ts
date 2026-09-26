import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_KEYS = [
  'DEMO_PASSWORD',
  'DEMO_COOKIE_SECRET',
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

function setValidEnv() {
  Object.assign(process.env, {
    DEMO_PASSWORD: 'test-password',
    DEMO_COOKIE_SECRET: 'x'.repeat(32),
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    AI_PROVIDER: 'mock',
    GOOGLE_GENERATIVE_AI_API_KEY: 'google-key',
    AI_CHAT_MODEL: 'chat-model',
    AI_EMBEDDING_MODEL: 'embedding-model',
    AI_EMBEDDING_DIMENSIONS: '768',
    MIN_VECTOR_SIMILARITY: '0.5',
    AI_GLOBAL_DAILY_CAP: '500',
    RATE_LIMIT_CHAT_PER_MIN: '10',
    RATE_LIMIT_INGEST_PER_HOUR: '20',
    RATE_LIMIT_AUDIO_PER_DAY: '3',
    MAX_UPLOAD_MB: '10',
    MAX_SOURCES_PER_NOTEBOOK: '10',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  });
}

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

  it('treats a blank optional variable as unset', async () => {
    setValidEnv();
    process.env.OLLAMA_BASE_URL = '';
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });

  it('still rejects a blank required variable, naming it', async () => {
    setValidEnv();
    process.env.DEMO_PASSWORD = '';
    await expect(import('@/lib/env')).rejects.toThrow(/DEMO_PASSWORD/);
  });

  it('does not throw when SKIP_ENV_VALIDATION=1 is set', async () => {
    process.env.SKIP_ENV_VALIDATION = '1';
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });
});
