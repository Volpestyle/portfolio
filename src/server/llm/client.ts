import { createOpenAiLlmClient, type LlmClient, type LlmProviderId, type OpenAiLlmClient } from '@portfolio/chat-llm';
import { getOpenAIClient } from '@/server/openai/client';
import { getAnthropicLlmClient } from '@/server/anthropic/client';

let cachedOpenAi: OpenAiLlmClient | null = null;

async function getOpenAiLlmClient(): Promise<OpenAiLlmClient> {
  if (cachedOpenAi) {
    return cachedOpenAi;
  }
  const openai = await getOpenAIClient();
  const llm = createOpenAiLlmClient(openai);
  cachedOpenAi = llm;
  return llm;
}

export async function getLlmClient(provider: LlmProviderId): Promise<LlmClient> {
  if (provider === 'anthropic') {
    return getAnthropicLlmClient();
  }
  return getOpenAiLlmClient();
}

