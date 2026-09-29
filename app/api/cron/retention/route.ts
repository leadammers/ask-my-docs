import { isValidBearer } from '@/lib/bearer';
import { env } from '@/lib/env';
import { toErrorResponse, userMessage } from '@/lib/errors';
import { runRetention } from '@/lib/retention-run';

// Daily retention cleanup (T08b), triggered by Vercel Cron (vercel.json).
// Exempt from the demo gate in proxy.ts; the only way in is the CRON_SECRET
// bearer token, which Vercel sends automatically.

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!isValidBearer(request.headers.get('authorization'), env.CRON_SECRET)) {
    return Response.json(
      { error: { code: 'unauthorized', message: userMessage('unauthorized') } },
      { status: 401 },
    );
  }

  try {
    const result = await runRetention();
    console.log(JSON.stringify({ level: 'info', event: 'retention_run', ...result }));
    return Response.json(result);
  } catch (error: unknown) {
    console.error(JSON.stringify({ level: 'error', event: 'retention_run_failed' }));
    const { status, code, userMessage: message } = toErrorResponse(error);
    return Response.json({ error: { code, message } }, { status });
  }
}
