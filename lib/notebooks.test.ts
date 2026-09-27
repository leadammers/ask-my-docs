import { describe, expect, it } from 'vitest';
import { canCreateNotebook, notebookIdSchema, notebookTitleSchema } from '@/lib/notebooks';
import { MAX_NOTEBOOKS_PER_USER, NOTEBOOK_TITLE_MAX_LENGTH } from '@/lib/config';

describe('canCreateNotebook', () => {
  it('allows creating below the cap', () => {
    expect(canCreateNotebook(MAX_NOTEBOOKS_PER_USER - 1)).toBe(true);
  });

  it('refuses creating at the cap', () => {
    expect(canCreateNotebook(MAX_NOTEBOOKS_PER_USER)).toBe(false);
  });

  it('refuses creating above the cap', () => {
    expect(canCreateNotebook(MAX_NOTEBOOKS_PER_USER + 1)).toBe(false);
  });
});

describe('notebookTitleSchema', () => {
  it('trims surrounding whitespace', () => {
    const result = notebookTitleSchema.parse('  My notebook  ');
    expect(result).toBe('My notebook');
  });

  it('rejects an empty title', () => {
    expect(notebookTitleSchema.safeParse('   ').success).toBe(false);
  });

  it('accepts a title at the length limit', () => {
    const title = 'a'.repeat(NOTEBOOK_TITLE_MAX_LENGTH);
    expect(notebookTitleSchema.safeParse(title).success).toBe(true);
  });

  it('rejects a title over the length limit', () => {
    const title = 'a'.repeat(NOTEBOOK_TITLE_MAX_LENGTH + 1);
    expect(notebookTitleSchema.safeParse(title).success).toBe(false);
  });
});

describe('notebookIdSchema', () => {
  it('accepts a valid UUID', () => {
    expect(notebookIdSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(notebookIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
