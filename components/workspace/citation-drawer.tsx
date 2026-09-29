'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCitationPages, type Citation } from '@/lib/chat/citations';
import { findQuoteRange } from '@/lib/chat/passage';
import { userMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

type ChunkView = { content: string; pageFrom: number | null; pageTo: number | null };

type ChunkState =
  | { status: 'loading' }
  | { status: 'loaded'; chunk: ChunkView }
  | { status: 'missing' }
  | { status: 'error' };

type CitationDrawerProps = {
  citation: Citation | null;
  onClose: () => void;
  /**
   * The chip that opened the drawer. This drawer has no `SheetTrigger` — it is
   * opened from state — so Base UI has no trigger of its own to fall back to and
   * would drop focus on the body when the popup closes. Handing it the element
   * lets Base UI restore focus itself, after its exit transition.
   */
  trigger: React.RefObject<HTMLElement | null>;
};

/** Highlights the quote inside the chunk text; markup is never involved (security.md §9). */
function Passage({ content, quote }: { content: string; quote: string }): React.JSX.Element {
  const range = findQuoteRange(content, quote);

  if (range === null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          Couldn&apos;t locate the quoted passage in this source — showing the whole passage.
        </p>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    );
  }

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {content.slice(0, range.start)}
      <mark className="bg-primary/20 rounded-sm">{content.slice(range.start, range.end)}</mark>
      {content.slice(range.end)}
    </p>
  );
}

export function CitationDrawer({
  citation,
  onClose,
  trigger,
}: CitationDrawerProps): React.JSX.Element {
  // The last citation stays on screen while the drawer animates out, so its
  // content does not blank out mid-exit (adjusted during render, not in an
  // effect — the pattern already used in components/source-list.tsx).
  const [shownCitation, setShownCitation] = useState<Citation | null>(citation);
  if (citation !== null && citation !== shownCitation) setShownCitation(citation);

  const [loaded, setLoaded] = useState<{ chunkId: string; state: ChunkState } | null>(null);
  const chunkId = shownCitation?.chunkId ?? null;

  useEffect(() => {
    if (chunkId === null) return;
    const requestedId = chunkId;
    const controller = new AbortController();

    async function loadChunk(): Promise<void> {
      // The browser client is RLS-scoped, so someone else's chunk and a chunk
      // that does not exist are indistinguishable — no existence oracle.
      const supabase = createClient();
      const { data, error } = await supabase
        .from('chunks')
        .select('content, page_from, page_to')
        .eq('id', requestedId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (controller.signal.aborted) return;
      if (error) {
        console.error(
          JSON.stringify({ operation: 'chunk.view', code: error.code, message: error.message }),
        );
        setLoaded({ chunkId: requestedId, state: { status: 'error' } });
        return;
      }
      if (!data) {
        setLoaded({ chunkId: requestedId, state: { status: 'missing' } });
        return;
      }
      setLoaded({
        chunkId: requestedId,
        state: {
          status: 'loaded',
          chunk: { content: data.content, pageFrom: data.page_from, pageTo: data.page_to },
        },
      });
    }

    void loadChunk();
    return () => controller.abort();
  }, [chunkId]);

  // Derived, not stored: a chunk that has not been fetched for this citation is
  // on its way, so nothing has to reset the state when the drawer reopens.
  const state: ChunkState =
    loaded !== null && loaded.chunkId === chunkId ? loaded.state : { status: 'loading' };

  const chunkPages =
    state.status === 'loaded' ? formatCitationPages(state.chunk.pageFrom, state.chunk.pageTo) : '';
  const pages =
    chunkPages ||
    formatCitationPages(shownCitation?.pageFrom ?? null, shownCitation?.pageTo ?? null);

  return (
    <Sheet open={citation !== null} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetPopup side="left" finalFocus={trigger}>
        {shownCitation === null ? null : (
          <>
            <SheetHeader>
              <SheetTitle>{shownCitation.sourceTitle}</SheetTitle>
              {pages ? <SheetDescription>{pages}</SheetDescription> : null}
            </SheetHeader>

            <div className="min-h-0 flex-1">
              {state.status === 'loading' ? (
                <div className="flex flex-col gap-2" aria-busy="true">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                  <span className="sr-only">Loading cited passage…</span>
                </div>
              ) : null}

              {state.status === 'loaded' ? (
                <Passage content={state.chunk.content} quote={shownCitation.quote} />
              ) : null}

              {state.status === 'missing' ? (
                <p className="text-muted-foreground text-sm">{userMessage('not_found')}</p>
              ) : null}

              {state.status === 'error' ? (
                <p className="text-muted-foreground text-sm">{userMessage('unexpected')}</p>
              ) : null}
            </div>
          </>
        )}
      </SheetPopup>
    </Sheet>
  );
}
