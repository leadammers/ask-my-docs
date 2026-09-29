'use client';

import { SourceList, type SourceListItem, type SourceSelection } from '@/components/source-list';
import { SourceUpload } from '@/components/source-upload';
import { Button } from '@/components/ui/button';

type SourcesPanelProps = {
  notebookId: string;
  sources: SourceListItem[];
  canEdit: boolean;
  maxUploadMb: number;
  selection: SourceSelection;
  onSelectAll: () => void;
  onSelectNone: () => void;
};

/** The sources column: what is in the notebook, and what the next answer may read. */
export function SourcesPanel({
  notebookId,
  sources,
  canEdit,
  maxUploadMb,
  selection,
  onSelectAll,
  onSelectNone,
}: SourcesPanelProps): React.JSX.Element {
  const readyCount = sources.filter((source) => source.status === 'ready').length;
  const selectedCount = selection.selectedIds.length;
  const selectableCount = Math.min(readyCount, selection.maxSelected);
  const isAllSelected = selectableCount > 0 && selectedCount >= selectableCount;
  const isAtLimit = readyCount > selection.maxSelected && selectedCount >= selection.maxSelected;
  const countLabel =
    selectedCount === 0
      ? 'No sources selected — the chat is paused'
      : `${selectedCount} of ${readyCount} sources used in chat`;

  return (
    <section aria-labelledby="sources-heading" className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sources-heading" className="text-lg font-semibold">
          Sources
        </h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={readyCount === 0 || isAllSelected}
            onClick={onSelectAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selectedCount === 0}
            onClick={onSelectNone}
          >
            Select none
          </Button>
        </div>
      </div>

      {canEdit ? <SourceUpload notebookId={notebookId} maxUploadMb={maxUploadMb} /> : null}

      {readyCount > 0 ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {countLabel}
          {isAtLimit ? ` (maximum ${selection.maxSelected})` : ''}
        </p>
      ) : null}

      <SourceList sources={sources} canEdit={canEdit} selection={selection} />
    </section>
  );
}
