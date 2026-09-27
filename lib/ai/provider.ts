import 'server-only';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { mockChatModel, mockEmbeddingModel } from '@/lib/ai/mock';
import { env } from '@/lib/env';

// The single door to the models (conventions/ai.md): provider and model IDs
// come from env only, so switching models never needs a code change.

export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

function openAiCompatible() {
  // Ollama serves an OpenAI-compatible API under /v1, so both share one adapter.
  if (env.AI_PROVIDER === 'ollama') {
    return createOpenAICompatible({
      name: 'ollama',
      baseURL: new URL('/v1', env.OLLAMA_BASE_URL).toString(),
    });
  }
  return createOpenAICompatible({
    name: 'openai-compatible',
    baseURL: env.OPENAI_COMPATIBLE_BASE_URL!,
    apiKey: env.OPENAI_COMPATIBLE_API_KEY,
  });
}

export function chatModel(): LanguageModel {
  switch (env.AI_PROVIDER) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(
        env.AI_CHAT_MODEL,
      );
    case 'mock':
      return mockChatModel(env.AI_CHAT_MODEL);
    default:
      return openAiCompatible().chatModel(env.AI_CHAT_MODEL);
  }
}

export function embeddingModel(): EmbeddingModel {
  switch (env.AI_PROVIDER) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }).embedding(
        env.AI_EMBEDDING_MODEL,
      );
    case 'mock':
      return mockEmbeddingModel(env.AI_EMBEDDING_MODEL, env.AI_EMBEDDING_DIMENSIONS);
    default:
      return openAiCompatible().embeddingModel(env.AI_EMBEDDING_MODEL);
  }
}

/** Provider options for embeddings; providers ignore keys that aren't theirs. */
export function embeddingProviderOptions(taskType: EmbeddingTaskType) {
  return {
    google: { outputDimensionality: env.AI_EMBEDDING_DIMENSIONS, taskType },
    'openai-compatible': { dimensions: env.AI_EMBEDDING_DIMENSIONS },
  };
}
