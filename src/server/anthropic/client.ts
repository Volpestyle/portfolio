import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicLlmClient, type AnthropicLlmClient } from '@portfolio/chat-llm';
import { resolveSecretValue } from '@/lib/secrets/manager';

let cached: { anthropic: Anthropic; llm: AnthropicLlmClient } | null = null;

export async function getAnthropicLlmClient(): Promise<AnthropicLlmClient> {
  if (cached) {
    return cached.llm;
  }
  const apiKey = await resolveSecretValue('ANTHROPIC_API_KEY', { scope: 'repo', required: true });
  const timeoutMs = Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 90000);
  const anthropic = new Anthropic({
    apiKey,
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
  });
  const llm = createAnthropicLlmClient(anthropic);
  cached = { anthropic, llm };
  return llm;
}

