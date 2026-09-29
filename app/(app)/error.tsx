'use client';

import { useEffect } from 'react';
import { userMessage } from '@/lib/errors';

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({ operation: 'app.render', digest: error.digest }));
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-foreground font-medium">{userMessage('unexpected')}</p>
      {error.digest ? (
        <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => retry()}
        className="text-sm underline underline-offset-4"
      >
        Try again
      </button>
    </main>
  );
}
