import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from 'ai';
import { chatModel } from '@/lib/ai/provider';
import {
  buildCitationMap,
  buildSystemPrompt,
  HISTORY_TURNS,
  NO_CONTEXT_ANSWER,
  recentHistory,
} from '@/lib/chat/prompt';
import { parseUsedCitations } from '@/lib/chat/citations';
import { chatRequestSchema, extractQuestion } from '@/lib/chat/request';
import { CHAT_MAX_OUTPUT_TOKENS, CHAT_QUESTION_MAX_CHARS } from '@/lib/config';
import { env } from '@/lib/env';
import { errorResponse, toErrorResponse, userMessage } from '@/lib/errors';
import { assertAiAllowed } from '@/lib/rate-limit';
import { retrieve } from '@/lib/retrieval/search';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CHAT_WINDOW_SECONDS = 60;

/**
 * Streaming chat for a notebook, grounded only in its selected sources. Every
 * check that can fail happens before the first byte (conventions/code.md,
 * "Streaming and real-time"); once streaming starts, only the answer or a
 * mapped error message goes out.
 */
export async function POST(request: Request): Promise<Response> {
  const json: unknown = await request.json().catch(() => null);
  const parsedBody = chatRequestSchema.safeParse(json);
  if (!parsedBody.success) return errorResponse('invalid_input');
  const { notebookId, sourceIds, messages } = parsedBody.data;

  const question = extractQuestion(messages);
  if (!question || question.length > CHAT_QUESTION_MAX_CHARS) return errorResponse('invalid_input');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse('unauthorized');

  // Same read-shared / write-owned check as the notebook page: RLS lets any
  // authenticated user select the demo notebook, so a user_id match here is
  // what actually proves this visitor may chat with it (security.md §3).
  const { data: notebook } = await supabase
    .from('notebooks')
    .select('id, user_id, is_demo')
    .eq('id', notebookId)
    .maybeSingle();
  if (!notebook || (notebook.user_id !== user.id && !notebook.is_demo))
    return errorResponse('not_found');

  try {
    await assertAiAllowed(user.id, 'chat', env.RATE_LIMIT_CHAT_PER_MIN, CHAT_WINDOW_SECONDS);
  } catch (error: unknown) {
    return errorResponse(toErrorResponse(error).code);
  }

  const { data: historyRows, error: historyError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('notebook_id', notebook.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS);
  if (historyError) return errorResponse('unexpected');
  const history = recentHistory(
    [...(historyRows ?? [])]
      .reverse()
      .map((row) => ({ role: row.role as 'user' | 'assistant', text: row.content })),
  );

  const requestId = crypto.randomUUID();
  let retrieved: Awaited<ReturnType<typeof retrieve>>;
  try {
    retrieved = await retrieve(
      supabase,
      { notebookId: notebook.id, sourceIds, question },
      { requestId, userId: user.id },
    );
  } catch (error: unknown) {
    return errorResponse(toErrorResponse(error).code);
  }
  const { chunks, hasRelevantContext } = retrieved;

  const { error: userInsertError } = await supabase.from('messages').insert({
    notebook_id: notebook.id,
    role: 'user',
    content: question,
  });
  if (userInsertError) return errorResponse('unexpected');

  // Assistant turns are persisted through the admin client: onFinish can run
  // after the HTTP response has already been sent (consumeStream keeps it
  // firing on disconnect), by which point the cookie-bound client can no
  // longer carry a refreshed session back to the browser (see the ingest
  // route's admin-client comment for the same reasoning).
  const admin = createAdminClient();

  if (!hasRelevantContext) {
    const { error: assistantInsertError } = await admin.from('messages').insert({
      notebook_id: notebook.id,
      user_id: user.id,
      role: 'assistant',
      content: NO_CONTEXT_ANSWER,
      citations: [],
    });
    if (assistantInsertError) {
      console.error(
        JSON.stringify({
          operation: 'messages.persistAssistant',
          requestId,
          userId: user.id,
          notebookId: notebook.id,
          code: assistantInsertError.code,
          message: assistantInsertError.message,
        }),
      );
    }

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text-start', id: 'text-1' });
        writer.write({ type: 'text-delta', id: 'text-1', delta: NO_CONTEXT_ANSWER });
        writer.write({ type: 'text-end', id: 'text-1' });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  const citations = buildCitationMap(chunks, question);
  // Only the blocks the prompt actually carries may be cited back — see
  // buildSystemPrompt (20260929 review). It takes the question too, because a
  // block the budget cuts short is re-quoted from the part the model read.
  const { systemPrompt, includedCitations } = buildSystemPrompt(citations, chunks, question);
  const modelMessages = [
    ...history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: 'user' as const, content: question },
  ];

  const result = streamText({
    model: chatModel(),
    system: systemPrompt,
    messages: modelMessages,
    maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
    onFinish: async (event) => {
      const usedCitations = parseUsedCitations(event.text, includedCitations);
      const { error } = await admin.from('messages').insert({
        notebook_id: notebook.id,
        user_id: user.id,
        role: 'assistant',
        content: event.text,
        citations: usedCitations,
      });
      if (error) {
        console.error(
          JSON.stringify({
            operation: 'messages.persistAssistant',
            requestId,
            userId: user.id,
            notebookId: notebook.id,
            code: error.code,
            message: error.message,
          }),
        );
      }
    },
    onError: (error) => {
      console.error(
        JSON.stringify({
          operation: 'chat.streamText',
          requestId,
          userId: user.id,
          error: String(error),
        }),
      );
    },
  });
  // Keeps onFinish (and so persistence) running even if the browser disconnects mid-answer.
  result.consumeStream();

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'data-citations', id: 'citations', data: includedCitations });
      writer.merge(toUIMessageStream({ stream: result.fullStream }));
    },
    // Never forward raw provider error text to the client (security.md §12).
    onError: () => userMessage('unexpected'),
  });

  return createUIMessageStreamResponse({ stream });
}
