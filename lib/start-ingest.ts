import { toast } from 'sonner';
import { userMessage } from '@/lib/errors';

type IngestErrorBody = { error: { code: string; message: string } };

/** Asks the server to ingest a source; the list polls its status. Failures become toasts. */
export async function startIngest(sourceId: string): Promise<void> {
  try {
    const response = await fetch(`/api/sources/${sourceId}/ingest`, { method: 'POST' });
    if (response.status === 202) return;
    const body = (await response.json()) as IngestErrorBody;
    toast.error(body.error.message);
  } catch {
    toast.error(userMessage('unexpected'));
  }
}
