import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_KEYS = [
  'DEMO_CODE_PEPPER',
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
  'CRON_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

function setValidEnv() {
  Object.assign(process.env, {
    DEMO_CODE_PEPPER: 'p'.repeat(32),
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
    delete process.env.VERCEL_ENV;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws naming a missing variable when required vars are absent', async () => {
    await expect(import('@/lib/env')).rejects.toThrow(/DEMO_CODE_PEPPER/);
  });

  it('treats a blank optional variable as unset', async () => {
    setValidEnv();
    process.env.OLLAMA_BASE_URL = '';
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });

  it('still rejects a blank required variable, naming it', async () => {
    setValidEnv();
    process.env.DEMO_CODE_PEPPER = '';
    await expect(import('@/lib/env')).rejects.toThrow(/DEMO_CODE_PEPPER/);
  });

  it('rejects a pepper shorter than 32 characters', async () => {
    setValidEnv();
    process.env.DEMO_CODE_PEPPER = 'short';
    await expect(import('@/lib/env')).rejects.toThrow(/DEMO_CODE_PEPPER/);
  });

  it('does not throw when SKIP_ENV_VALIDATION=1 is set', async () => {
    process.env.SKIP_ENV_VALIDATION = '1';
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });

  it('coerces numbers when SKIP_ENV_VALIDATION=1 is set', async () => {
    process.env.SKIP_ENV_VALIDATION = '1';
    process.env.AI_EMBEDDING_DIMENSIONS = '768';
    const { env } = await import('@/lib/env');
    expect(env.AI_EMBEDDING_DIMENSIONS).toBe(768);
  });

  it('ignores invalid values instead of throwing when SKIP_ENV_VALIDATION=1 is set', async () => {
    // `vercel build` in CI sees placeholders instead of the real (sensitive) values.
    process.env.SKIP_ENV_VALIDATION = '1';
    process.env.AI_PROVIDER = 'placeholder';
    process.env.DEMO_COOKIE_SECRET = 'short';
    process.env.MAX_UPLOAD_MB = 'placeholder';
    process.env.AI_EMBEDDING_DIMENSIONS = '768';
    const { env } = await import('@/lib/env');
    expect(env.AI_PROVIDER).toBeUndefined();
    expect(env.DEMO_COOKIE_SECRET).toBeUndefined();
    expect(env.MAX_UPLOAD_MB).toBeUndefined();
    expect(env.AI_EMBEDDING_DIMENSIONS).toBe(768);
  });

  it('does not require GOOGLE_GENERATIVE_AI_API_KEY for other providers', async () => {
    setValidEnv();
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.AI_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });

  it('rejects AI_PROVIDER=google without GOOGLE_GENERATIVE_AI_API_KEY', async () => {
    setValidEnv();
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.AI_PROVIDER = 'google';
    await expect(import('@/lib/env')).rejects.toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it('rejects AI_PROVIDER=mock in Vercel production', async () => {
    setValidEnv();
    process.env.AI_PROVIDER = 'mock';
    process.env.VERCEL_ENV = 'production';
    await expect(import('@/lib/env')).rejects.toThrow(/AI_PROVIDER=mock/);
  });

  it('allows AI_PROVIDER=mock in Vercel preview', async () => {
    setValidEnv();
    process.env.AI_PROVIDER = 'mock';
    process.env.VERCEL_ENV = 'preview';
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });

  it('rejects a missing CRON_SECRET in Vercel production', async () => {
    setValidEnv();
    process.env.AI_PROVIDER = 'google';
    process.env.VERCEL_ENV = 'production';
    await expect(import('@/lib/env')).rejects.toThrow(/CRON_SECRET is required/);
  });

  it('allows a missing CRON_SECRET outside Vercel production', async () => {
    setValidEnv();
    process.env.VERCEL_ENV = 'preview';
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });

  it('rejects AI_PROVIDER=ollama without OLLAMA_BASE_URL', async () => {
    setValidEnv();
    process.env.AI_PROVIDER = 'ollama';
    await expect(import('@/lib/env')).rejects.toThrow(/OLLAMA_BASE_URL/);
  });

  it('rejects AI_PROVIDER=openai-compatible without OPENAI_COMPATIBLE_BASE_URL', async () => {
    setValidEnv();
    process.env.AI_PROVIDER = 'openai-compatible';
    await expect(import('@/lib/env')).rejects.toThrow(/OPENAI_COMPATIBLE_BASE_URL/);
  });
});
