'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { userMessage } from '@/lib/errors';

/**
 * The notebook route sits outside the `(app)` group, so it inherits neither of
 * that group's boundaries and needs its own. Next 16.3 hands this boundary a
 * `retry`, not the older `reset`.
 */
export default function NotebookError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({ operation: 'notebook.render', digest: error.digest }));
  }, [error]);

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-foreground font-medium">{userMessage('unexpected')}</p>
      {error.digest ? (
        <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          Back to notebooks
        </Button>
      </div>
    </main>
  );
}
