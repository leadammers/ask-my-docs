// Manual inspection of hybrid retrieval (T06): prints ranked chunks with
// both leg scores for a question against the demo notebook, or against a
// given notebook id.
//   pnpm script scripts/search.ts "<question>" [notebookId]
import { randomUUID } from 'node:crypto';
import { retrieve } from '@/lib/retrieval/search';
import { createAdminClient } from '@/lib/supabase/admin';

async function resolveDemoNotebookId(
  client: ReturnType<typeof createAdminClient>,
): Promise<string> {
  const { data: settings, error: settingsError } = await client
    .from('app_settings')
    .select('demo_owner_id')
    .maybeSingle();
  if (settingsError) throw new Error('Failed to load app_settings', { cause: settingsError });
  if (!settings?.demo_owner_id) {
    throw new Error('No demo notebook configured; pass a notebook id as the second argument.');
  }

  const { data: notebook, error: notebookError } = await client
    .from('notebooks')
    .select('id')
    .eq('user_id', settings.demo_owner_id)
    .eq('is_demo', true)
    .maybeSingle();
  if (notebookError) throw new Error('Failed to load the demo notebook', { cause: notebookError });
  if (!notebook) {
    throw new Error('Demo notebook not found; pass a notebook id as the second argument.');
  }
  return notebook.id;
}

async function main() {
  const [question, notebookIdArg] = process.argv.slice(2);
  if (!question) {
    console.error('Usage: pnpm script scripts/search.ts "<question>" [notebookId]');
    process.exit(1);
  }

  const client = createAdminClient();
  const notebookId = notebookIdArg ?? (await resolveDemoNotebookId(client));

  const { data: sources, error: sourcesError } = await client
    .from('sources')
    .select('id')
    .eq('notebook_id', notebookId)
    .eq('status', 'ready');
  if (sourcesError) throw new Error('Failed to load sources', { cause: sourcesError });
  const sourceIds = (sources ?? []).map((source) => source.id);

  const result = await retrieve(
    client,
    { notebookId, sourceIds, question },
    { requestId: randomUUID(), userId: null },
  );

  console.log(`notebook=${notebookId} sources=${sourceIds.length}`);
  console.log(`hasRelevantContext=${result.hasRelevantContext}`);
  for (const chunk of result.chunks) {
    const vectorScore = chunk.vectorScore?.toFixed(4) ?? '-';
    const textRank = chunk.textRank?.toFixed(4) ?? '-';
    console.log(
      `\n[fused ${chunk.fusedScore.toFixed(4)}] vector=${vectorScore} text=${textRank} — ${chunk.sourceTitle} (p.${chunk.pageFrom ?? '?'}-${chunk.pageTo ?? '?'})`,
    );
    console.log(`  ${chunk.content.slice(0, 200).replace(/\s+/g, ' ')}`);
  }
}

main().catch((error: unknown) => {
  console.error('search failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
