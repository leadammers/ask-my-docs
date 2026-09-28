'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { createSourceUpload, deleteSource } from '@/app/n/[id]/actions';
import { Button } from '@/components/ui/button';
import { userMessage } from '@/lib/errors';
import { maxUploadBytes } from '@/lib/sources';
import { startIngest } from '@/lib/start-ingest';
import { createClient } from '@/lib/supabase/client';

const PRIVACY_NOTICE =
  "Uploaded content is sent to Google Gemini for processing; the free tier may use it to improve Google's products.";

type SourceUploadProps = { notebookId: string; maxUploadMb: number };

export function SourceUpload({ notebookId, maxUploadMb }: SourceUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    // Checked here so an oversized file is never created or uploaded at all.
    if (file.size > maxUploadBytes(maxUploadMb)) {
      toast.error(userMessage('file_too_large'));
      input.value = '';
      return;
    }

    setIsPending(true);
    try {
      const created = await createSourceUpload({
        notebookId,
        fileName: file.name,
        size: file.size,
      });
      if (!created.ok) {
        toast.error(userMessage(created.error));
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.storage
        .from('sources')
        .uploadToSignedUrl(created.value.path, created.value.token, file, {
          contentType: 'application/pdf',
        });
      if (error) {
        toast.error(userMessage('unexpected'));
        // No file means no ingest: drop the row created for this attempt.
        await deleteSource(created.value.sourceId);
        return;
      }

      await startIngest(created.value.sourceId);
      router.refresh();
    } finally {
      setIsPending(false);
      // Lets the same file be picked again after a failure.
      input.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">{PRIVACY_NOTICE}</p>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Upload PDF"
          className="hidden"
          disabled={isPending}
          onChange={handleFile}
        />
        <Button type="button" disabled={isPending} onClick={() => inputRef.current?.click()}>
          {isPending ? 'Uploading…' : 'Add PDF'}
        </Button>
      </div>
    </div>
  );
}
