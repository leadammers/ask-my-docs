import { z } from 'zod';
import { CHAT_MAX_SOURCE_IDS, CHAT_QUESTION_MAX_CHARS } from '@/lib/config';
import { notebookIdSchema } from '@/lib/notebooks';
import { sourceIdSchema } from '@/lib/sources';

const uiMessagePartSchema = z.looseObject({
  type: z.string().max(64),
  text: z
    .string()
    .max(CHAT_QUESTION_MAX_CHARS * 4)
    .optional(),
});

const uiMessageSchema = z.object({
  id: z.string().max(128),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(uiMessagePartSchema).max(20),
});
export type UiMessage = z.infer<typeof uiMessageSchema>;

export const chatRequestSchema = z.object({
  notebookId: notebookIdSchema,
  sourceIds: z.array(sourceIdSchema).min(1).max(CHAT_MAX_SOURCE_IDS),
  messages: z.array(uiMessageSchema).min(1).max(100),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** The text of the latest user message, or null if there isn't one / it's empty. */
export function extractQuestion(messages: UiMessage[]): string | null {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) return null;

  const text = lastUser.parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();

  return text.length > 0 ? text : null;
}
