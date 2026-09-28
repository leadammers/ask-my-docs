import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chat } from '@/components/chat/chat';
import { SourceList, type SourceListItem } from '@/components/source-list';
import { SourceUpload } from '@/components/source-upload';
import { Button } from '@/components/ui/button';
import type { Citation } from '@/lib/chat/citations';
import { CHAT_MAX_SOURCE_IDS } from '@/lib/config';
import { env } from '@/lib/env';
import { notebookIdSchema } from '@/lib/notebooks';
import type { SourceStatus } from '@/lib/sources';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

type SourceRow = Pick<
  Tables<'sources'>,
  'id' | 'title' | 'status' | 'progress' | 'error' | 'page_count' | 'created_at' | 'updated_at'
>;

type MessageRow = Pick<Tables<'messages'>, 'id' | 'role' | 'content' | 'citations'>;

type InitialChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: ({ type: 'text'; text: string } | { type: 'data-citations'; data: Citation[] })[];
};

function toInitialMessage(row: MessageRow): InitialChatMessage {
  const citations = (row.citations as Citation[] | null) ?? [];
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    parts:
      row.role === 'assistant'
        ? [
            { type: 'data-citations', data: citations },
            { type: 'text', text: row.content },
          ]
        : [{ type: 'text', text: row.content }],
  };
}

export default async function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = notebookIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: notebook } = await supabase
    .from('notebooks')
    .select('id, title, user_id, is_demo')
    .eq('id', parsedId.data)
    .maybeSingle();
  if (!notebook || (notebook.user_id !== user.id && !notebook.is_demo)) notFound();

  const { data: sources, error: sourcesError } = await supabase
    .from('sources')
    .select('id, title, status, progress, error, page_count, created_at, updated_at')
    .eq('notebook_id', notebook.id)
    .order('created_at', { ascending: true });

  if (sourcesError) {
    console.error(
      JSON.stringify({
        operation: 'sources.list',
        userId: user.id,
        notebookId: notebook.id,
        code: sourcesError.code,
        message: sourcesError.message,
      }),
    );
    throw new Error('Failed to load sources');
  }

  const { data: messageRows, error: messagesError } = await supabase
    .from('messages')
    .select('id, role, content, citations')
    .eq('notebook_id', notebook.id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error(
      JSON.stringify({
        operation: 'messages.list',
        userId: user.id,
        notebookId: notebook.id,
        code: messagesError.code,
        message: messagesError.message,
      }),
    );
    throw new Error('Failed to load chat history');
  }

  // Only the owner can change the sources; a demo notebook is read-only for everyone.
  const canEdit = notebook.user_id === user.id && !notebook.is_demo;
  const sourceItems: SourceListItem[] = (sources ?? []).map((source: SourceRow) => ({
    id: source.id,
    title: source.title,
    status: source.status as SourceStatus,
    progress: source.progress,
    error: source.error,
    pageCount: source.page_count,
    createdAt: source.created_at,
    updatedAt: source.updated_at,
  }));
  const readySourceIds = (sources ?? [])
    .filter((source: SourceRow) => source.status === 'ready')
    .map((source: SourceRow) => source.id)
    .slice(0, CHAT_MAX_SOURCE_IDS);
  const initialMessages = (messageRows ?? []).map((row) => toInitialMessage(row as MessageRow));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/" aria-label="Back to notebooks" />}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-2xl font-semibold">{notebook.title}</h1>
      </div>
      <section aria-labelledby="sources-heading" className="flex flex-col gap-4">
        <h2 id="sources-heading" className="text-lg font-semibold">
          Sources
        </h2>
        {canEdit ? <SourceUpload notebookId={notebook.id} maxUploadMb={env.MAX_UPLOAD_MB} /> : null}
        <SourceList sources={sourceItems} canEdit={canEdit} />
      </section>
      <section aria-labelledby="chat-heading" className="flex flex-col gap-4">
        <h2 id="chat-heading" className="sr-only">
          Chat
        </h2>
        <Chat
          notebookId={notebook.id}
          sourceIds={readySourceIds}
          initialMessages={initialMessages}
        />
      </section>
    </main>
  );
}
