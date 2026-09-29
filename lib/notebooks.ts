import { z } from 'zod';
import { MAX_NOTEBOOKS_PER_USER, NOTEBOOK_TITLE_MAX_LENGTH } from '@/lib/config';

export const notebookTitleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(NOTEBOOK_TITLE_MAX_LENGTH, 'Title is too long');

export const notebookIdSchema = z.uuid();

export function canCreateNotebook(existingOwnedCount: number): boolean {
  return existingOwnedCount < MAX_NOTEBOOKS_PER_USER;
}
