import { describe, expect, it } from 'vitest';

describe('server-only alias', () => {
  it("lets a module importing 'server-only' load under Vitest", async () => {
    await expect(import('server-only')).resolves.toBeDefined();
  });
});
