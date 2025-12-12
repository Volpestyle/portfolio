import OpenAI from 'openai';
import {
  createAnthropicClient,
  createAnthropicLlmClient,
  createOpenAiLlmClient,
  type LlmClient,
  type LlmProviderId,
} from '@portfolio/chat-llm';
import { requireEnv } from './env';

let cachedOpenAi: ReturnType<typeof createOpenAiLlmClient> | null = null;
let cachedAnthropic: ReturnType<typeof createAnthropicLlmClient> | null = null;

export function getPreprocessLlmClient(provider: LlmProviderId): LlmClient {
  if (provider === 'anthropic') {
    if (cachedAnthropic) return cachedAnthropic;
    const apiKey = requireEnv('ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY is required when provider=anthropic');
    const client = createAnthropicClient({ apiKey });
    cachedAnthropic = createAnthropicLlmClient(client);
    return cachedAnthropic;
  }

  if (cachedOpenAi) return cachedOpenAi;
  const apiKey = requireEnv('OPENAI_API_KEY', 'OPENAI_API_KEY is required when provider=openai');
  const client = new OpenAI({ apiKey });
  cachedOpenAi = createOpenAiLlmClient(client);
  return cachedOpenAi;
}

