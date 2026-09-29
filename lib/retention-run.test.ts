import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runRetention } from '@/lib/retention-run';
import type { Database } from '@/lib/supabase/types';

// The Supabase client is the module's I/O boundary and is injected; the
// decision (who is stale) and the failure handling are what these tests
// exercise. `lib/retention-run.integration.test.ts` covers the real client.

const STALE_USER = '11111111-1111-4111-8111-111111111111';
const ANCIENT = '2020-01-01T00:00:00.000Z';

type DeleteUserError = { code?: string; status?: number; message?: string };

function fakeClient(deleteUserError: DeleteUserError | null): SupabaseClient<Database> {
  const client = {
    rpc: async () => ({
      data: [{ user_id: STALE_USER, is_anonymous: true, last_active_at: ANCIENT }],
      error: null,
    }),
    from: () => ({
      select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    }),
    auth: {
      admin: {
        deleteUser: async () => ({
          data: { user: deleteUserError ? null : { id: STALE_USER } },
          error: deleteUserError,
        }),
      },
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

function loggedFailure(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  expect(spy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(spy.mock.calls[0][0])) as Record<string, unknown>;
}

describe('runRetention failure logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the failing step and the upstream code, never the message', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runRetention({
      client: fakeClient({ code: 'unexpected_failure', message: 'boom\nsecret' }),
      removeObjects: async (): Promise<number> => 0,
    });

    expect(result.usersFailed).toBe(1);
    const entry = loggedFailure(spy);
    expect(entry.event).toBe('retention_user_failed');
    expect(entry.userId).toBe(STALE_USER);
    expect(entry.operation).toBe('delete_user');
    expect(entry.code).toBe('unexpected_failure');
    expect(JSON.stringify(entry)).not.toContain('boom');
  });

  it('logs the storage step when the objects cannot be removed', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runRetention({
      client: fakeClient(null),
      removeObjects: async (): Promise<number> => {
        throw new Error('Failed to remove storage objects', { cause: { code: 'NoSuchBucket' } });
      },
    });

    expect(result.usersFailed).toBe(1);
    const entry = loggedFailure(spy);
    expect(entry.operation).toBe('remove_objects');
    expect(entry.code).toBe('NoSuchBucket');
  });

  it('falls back to an unknown code for anything that is not a plain code', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runRetention({
      client: fakeClient({ code: 'not a code, a sentence' }),
      removeObjects: async (): Promise<number> => 0,
    });

    expect(loggedFailure(spy).code).toBe('unknown');
  });

  it('logs nothing when every user is deleted', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runRetention({
      client: fakeClient(null),
      removeObjects: async (): Promise<number> => 3,
    });

    expect(result).toMatchObject({ usersDeleted: 1, usersFailed: 0, objectsRemoved: 3 });
    expect(spy).not.toHaveBeenCalled();
  });
});
