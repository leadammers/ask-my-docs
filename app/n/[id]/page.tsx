import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SourceListItem } from '@/components/source-list';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { NotebookTitle } from '@/components/workspace/notebook-title';
import { StudioPanel } from '@/components/workspace/studio-panel';
import { Workspace } from '@/components/workspace/workspace';
import { citationSchema, type Citation } from '@/lib/chat/citations';
import { CHAT_MAX_SOURCE_IDS } from '@/lib/config';
import { env } from '@/lib/env';
import { notebookIdSchema } from '@/lib/notebooks';
import type { SourceStatus } from '@/lib/sources';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';
import { z } from 'zod';

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
  const parsed = z.array(citationSchema).safeParse(row.citations ?? []);
  const citations: Citation[] = parsed.success ? parsed.data : [];
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

  // A bounded shell: the workspace fills the viewport and each column scrolls on
  // its own, instead of the whole page scrolling under a fixed-height chat pane.
  return (
    <main className="mx-auto flex h-dvh w-full max-w-7xl flex-col gap-4 overflow-hidden p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          // The rendered element is an anchor, not a <button>: without this Base UI
          // warns that it is keeping button semantics on a non-button.
          nativeButton={false}
          render={<Link href="/" aria-label="Back to notebooks" />}
        >
          <ArrowLeftIcon />
        </Button>
        <NotebookTitle notebookId={notebook.id} title={notebook.title} canEdit={canEdit} />
        <div className="flex items-center gap-1">
          <StudioPanel />
          <ThemeToggle />
        </div>
      </div>
      <Workspace
        notebookId={notebook.id}
        canEdit={canEdit}
        maxUploadMb={env.MAX_UPLOAD_MB}
        sources={sourceItems}
        readySourceIds={readySourceIds}
        initialMessages={initialMessages}
      />
    </main>
  );
}
