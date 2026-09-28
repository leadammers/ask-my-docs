'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteSource } from '@/app/n/[id]/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { userMessage } from '@/lib/errors';
import {
  describeProgress,
  formatPageCount,
  isInProgress,
  isRetryable,
  type SourceStatus,
} from '@/lib/sources';
import { startIngest } from '@/lib/start-ingest';

export type SourceListItem = {
  id: string;
  title: string;
  status: SourceStatus;
  progress: unknown;
  error: string | null;
  pageCount: number | null;
  createdAt: string;
};

const POLL_INTERVAL_MS = 2000;
const GIVE_UP_AFTER_MS = 5 * 60 * 1000;

const STATUS_LABELS: Record<SourceStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

type StatusVariant = 'outline' | 'secondary' | 'default' | 'destructive';

const STATUS_VARIANTS: Record<SourceStatus, StatusVariant> = {
  pending: 'outline',
  processing: 'secondary',
  ready: 'default',
  failed: 'destructive',
};

type SourceListProps = { sources: SourceListItem[]; canEdit: boolean };

export function SourceList({ sources, canEdit }: SourceListProps) {
  const router = useRouter();
  const [now, setNow] = useState<Date>(() => new Date());
  const [isDeletePending, startDelete] = useTransition();
  const [isRetryPending, startRetry] = useTransition();
  const [hasGivenUpPolling, setHasGivenUpPolling] = useState(false);

  const hasInProgress = sources.some((source: SourceListItem) => isInProgress(source.status));
  const isPolling = hasInProgress && !hasGivenUpPolling;

  useEffect(() => {
    if (!isPolling) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setNow(new Date());
      if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
        setHasGivenUpPolling(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPolling, router]);

  // After everything settles, the next upload or retry gets a fresh 5 minutes.
  // Adjusting state during render (not in an effect) is React's pattern for this.
  if (!hasInProgress && hasGivenUpPolling) setHasGivenUpPolling(false);

  function handleRetry(id: string): void {
    startRetry(async () => {
      await startIngest(id);
      router.refresh();
    });
  }

  function handleDelete(id: string): void {
    startDelete(async () => {
      const result = await deleteSource(id);
      if (!result.ok) {
        toast.error(userMessage(result.error));
        return;
      }
      router.refresh();
    });
  }

  if (sources.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No sources yet. Add a PDF to get started.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Sources" className="flex flex-col gap-2">
        {sources.map((source: SourceListItem) => {
          const progressLine = describeProgress(source.status, source.progress);
          const canRetry = canEdit && isRetryable(source.status, new Date(source.createdAt), now);

          return (
            <li
              key={source.id}
              className="border-border flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate font-medium">{source.title}</p>
                <div aria-live="polite" className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[source.status]}>
                      {STATUS_LABELS[source.status]}
                    </Badge>
                    {progressLine ? (
                      <span className="text-muted-foreground text-sm">{progressLine}</span>
                    ) : null}
                  </div>
                  {source.status === 'ready' && source.pageCount !== null ? (
                    <p className="text-muted-foreground text-sm">
                      {formatPageCount(source.pageCount)}
                    </p>
                  ) : null}
                  {source.status === 'failed' && source.error ? (
                    <p className="text-destructive text-sm">{source.error}</p>
                  ) : null}
                </div>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  {canRetry ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isRetryPending}
                      onClick={() => handleRetry(source.id)}
                    >
                      Retry
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${source.title}`}
                    disabled={isDeletePending}
                    onClick={() => handleDelete(source.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hasGivenUpPolling && hasInProgress ? (
        <p className="text-muted-foreground text-sm">
          Still processing — refresh the page to check again.
        </p>
      ) : null}
    </div>
  );
}
