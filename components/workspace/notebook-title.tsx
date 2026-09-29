'use client';

import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { renameNotebook } from '@/app/(app)/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NOTEBOOK_TITLE_MAX_LENGTH } from '@/lib/config';
import { userMessage } from '@/lib/errors';

type NotebookTitleProps = { notebookId: string; title: string; canEdit: boolean };

/**
 * The notebook's title, editable in place. There is no optimistic copy: the
 * action revalidates this route, so the heading the server sends back is the one
 * on screen — the same pattern as the home page's notebook card.
 */
export function NotebookTitle({
  notebookId,
  title,
  canEdit,
}: NotebookTitleProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextTitle = draft.trim();
    if (nextTitle.length === 0) return;
    startTransition(async () => {
      const result = await renameNotebook(notebookId, nextTitle);
      if (!result.ok) {
        toast.error(userMessage(result.error));
        return;
      }
      setIsEditing(false);
    });
  }

  function startEditing(): void {
    // Seed from the server's title, not from whatever was typed and abandoned.
    setDraft(title);
    setIsEditing(true);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {canEdit && isEditing ? (
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            autoFocus
            value={draft}
            maxLength={NOTEBOOK_TITLE_MAX_LENGTH}
            disabled={isPending}
            aria-label="Notebook title"
            className="h-9 max-w-sm text-base"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setIsEditing(false);
              }
            }}
          />
          <Button type="submit" size="icon-sm" aria-label="Save title" disabled={isPending}>
            <CheckIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel rename"
            disabled={isPending}
            onClick={() => setIsEditing(false)}
          >
            <XIcon />
          </Button>
        </form>
      ) : (
        <>
          <h1 className="truncate text-2xl font-semibold">{title}</h1>
          {canEdit ? (
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              aria-label="Rename notebook"
              onClick={startEditing}
            >
              <PencilIcon />
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
