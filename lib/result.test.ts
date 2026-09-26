import { describe, expect, it } from 'vitest';
import { fail, ok } from '@/lib/result';

describe('Result', () => {
  it('wraps a success value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('wraps a failure value', () => {
    expect(fail('bad input')).toEqual({ ok: false, error: 'bad input' });
  });
});
