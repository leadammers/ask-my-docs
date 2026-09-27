// Real-model smoke test (conventions/ai.md): one embedding and one short
// completion against the configured provider. Prints sizes and token counts,
// never content beyond the fixed test prompt.
//   pnpm script scripts/smoke-ai.ts
import { randomUUID } from 'node:crypto';
import { generateText } from 'ai';
import { embedQuery } from '@/lib/ai/embeddings';
import { chatModel } from '@/lib/ai/provider';
import { withRetry } from '@/lib/ai/retry';
import { env } from '@/lib/env';

async function main() {
  const context = { requestId: randomUUID(), userId: null };
  console.log(
    `provider=${env.AI_PROVIDER} chat=${env.AI_CHAT_MODEL} embedding=${env.AI_EMBEDDING_MODEL}`,
  );

  const embedding = await embedQuery('The quick brown fox jumps over the lazy dog.', context);
  console.log(
    `embedding: ${embedding.length} dimensions (expected ${env.AI_EMBEDDING_DIMENSIONS})`,
  );

  const result = await withRetry(() =>
    generateText({
      model: chatModel(),
      prompt: 'Reply with the single word: ok',
      maxOutputTokens: 16,
      maxRetries: 0,
    }),
  );
  console.log(
    `completion: ${result.text.trim().length} chars, input tokens ${result.usage.inputTokens}, output tokens ${result.usage.outputTokens}`,
  );
}

main().catch((error: unknown) => {
  console.error('smoke-ai failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
