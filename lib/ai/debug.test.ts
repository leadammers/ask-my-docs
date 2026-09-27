// @vitest-environment node
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

describe('debug', () => {
  beforeEach(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('AI_EMBEDDING_MODEL', 'mock-embed');
    vi.stubEnv('AI_EMBEDDING_DIMENSIONS', '8');
    vi.stubEnv('AI_CHAT_MODEL', 'mock-chat');
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('checks types', async () => {
    const { env } = await import('@/lib/env');
    console.log(
      'typeof',
      typeof env.AI_EMBEDDING_DIMENSIONS,
      JSON.stringify(env.AI_EMBEDDING_DIMENSIONS),
    );
    console.log('SKIP_ENV_VALIDATION', process.env.SKIP_ENV_VALIDATION);
  });
});
