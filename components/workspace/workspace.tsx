'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Chat } from '@/components/chat/chat';
import type { SourceListItem, SourceSelection } from '@/components/source-list';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CitationDrawer } from '@/components/workspace/citation-drawer';
import { PanelResizer } from '@/components/workspace/panel-resizer';
import { SourcesPanel } from '@/components/workspace/sources-panel';
import { useIsWide } from '@/components/workspace/use-is-wide';
import type { Citation } from '@/lib/chat/citations';
import { CHAT_MAX_SOURCE_IDS } from '@/lib/config';
import { clampPanelWidth, panelColumnsTemplate, sourcesPanelWidthBounds } from '@/lib/panels';
import { usableSourceIds } from '@/lib/sources';

type WorkspaceProps = {
  notebookId: string;
  canEdit: boolean;
  maxUploadMb: number;
  sources: SourceListItem[];
  /** Every ready source, in the order the page listed them — the selection's starting point. */
  readySourceIds: string[];
  initialMessages: React.ComponentProps<typeof Chat>['initialMessages'];
};

/**
 * Sources and chat, side by side where there is room and as tabs where there is
 * not. The workspace owns the one piece of state the two panels share: which
 * sources the next answer may read.
 */
export function Workspace({
  notebookId,
  canEdit,
  maxUploadMb,
  sources,
  readySourceIds,
  initialMessages,
}: WorkspaceProps): React.JSX.Element {
  const isWide = useIsWide();
  const [selection, setSelection] = useState<string[] | null>(null);
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  // Handed to the drawer, which passes it to Base UI as `finalFocus`.
  const citationChip = useRef<HTMLElement | null>(null);
  // The split between the two columns. `sourcesWidth` is `null` only before the
  // first measurement, when the default (17rem in the template) still applies.
  const [sourcesWidth, setSourcesWidth] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  const sourcesColumn = useRef<HTMLDivElement | null>(null);

  function openCitationAt(citation: Citation, trigger: HTMLElement): void {
    citationChip.current = trigger;
    setOpenCitation(citation);
  }

  // Measure on mount and on every window resize. Both the drag's limits and the
  // starting width come from the real layout, and a width that was fine on a
  // wide screen is clamped again when the window shrinks — otherwise the chat
  // is left with a sliver. Keyed on `isWide` because the grid does not exist in
  // the tab layout, so crossing the breakpoint has to measure afresh.
  useLayoutEffect(() => {
    const gridElement = grid.current;
    const columnElement = sourcesColumn.current;
    if (!isWide || gridElement === null || columnElement === null) return undefined;
    // Rebound, because TypeScript does not carry the check above into `measure`.
    const measuredGrid = gridElement;
    const measuredColumn = columnElement;

    function measure(): void {
      const width = measuredGrid.clientWidth;
      const bounds = sourcesPanelWidthBounds(width);
      setContainerWidth(width);
      setSourcesWidth((current) =>
        clampPanelWidth(current ?? measuredColumn.getBoundingClientRect().width, bounds),
      );
    }

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isWide]);

  // `null` means the user has not chosen yet: the selection is "everything ready"
  // and a source that finishes processing joins it. The moment the user changes
  // the selection their choice sticks — a new source then arrives unchecked, and
  // the count in the panel is what says so.
  const defaultSelection = useMemo(
    () => readySourceIds.slice(0, CHAT_MAX_SOURCE_IDS),
    [readySourceIds],
  );
  // A chosen source can leave `ready` under us — deleted, or sent back to
  // processing by a retry. Its id must not be counted, sent to the API or shown
  // as checked until it is ready again; the choice itself is kept, so a source
  // that comes back ready is still the user's.
  const selectedIds = usableSourceIds(selection ?? defaultSelection, readySourceIds);

  function toggleSource(sourceId: string): void {
    setSelection((current) => {
      const base = current ?? defaultSelection;
      if (base.includes(sourceId)) return base.filter((id) => id !== sourceId);
      // The API caps what it accepts, so the UI refuses to build a longer list.
      // Only the ready ids count towards the cap — the others are never sent.
      if (usableSourceIds(base, readySourceIds).length >= CHAT_MAX_SOURCE_IDS) return base;
      return [...base, sourceId];
    });
  }

  const sourceSelection: SourceSelection = {
    selectedIds,
    maxSelected: CHAT_MAX_SOURCE_IDS,
    onToggle: toggleSource,
  };

  const chat = (
    <Chat
      notebookId={notebookId}
      sourceIds={selectedIds}
      hasReadySources={readySourceIds.length > 0}
      initialMessages={initialMessages}
      onCitationOpen={openCitationAt}
    />
  );

  const sourcesPanel = (
    <SourcesPanel
      notebookId={notebookId}
      sources={sources}
      canEdit={canEdit}
      maxUploadMb={maxUploadMb}
      selection={sourceSelection}
      onSelectAll={() => setSelection(readySourceIds.slice(0, CHAT_MAX_SOURCE_IDS))}
      onSelectNone={() => setSelection([])}
    />
  );

  return (
    <>
      {isWide ? (
        <div
          ref={grid}
          // The divider's column replaces the gap the two columns used to sit
          // apart by, so the split is the same width it always was.
          style={{ gridTemplateColumns: panelColumnsTemplate(sourcesWidth) }}
          className="grid min-h-0 flex-1"
        >
          <div ref={sourcesColumn} className="min-h-0 overflow-y-auto pr-1">
            {sourcesPanel}
          </div>
          <PanelResizer
            gridRef={grid}
            panelRef={sourcesColumn}
            width={sourcesWidth}
            bounds={sourcesPanelWidthBounds(containerWidth)}
            onResize={setSourcesWidth}
          />
          {chat}
        </div>
      ) : (
        <Tabs defaultValue="chat" className="min-h-0 flex-1">
          <TabsList variant="line" className="shrink-0">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>
          {/* `keepMounted` on both: switching tabs must not unmount the chat and
              throw away an answer that is still streaming. */}
          <TabsContent value="chat" keepMounted className="min-h-0 overflow-hidden">
            {chat}
          </TabsContent>
          <TabsContent value="sources" keepMounted className="min-h-0 overflow-y-auto">
            {sourcesPanel}
          </TabsContent>
        </Tabs>
      )}
      <CitationDrawer
        citation={openCitation}
        onClose={() => setOpenCitation(null)}
        trigger={citationChip}
      />
    </>
  );
}
