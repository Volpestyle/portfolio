import OpenAI from 'openai';
import { resolveSecretValue } from '@/lib/secrets/manager';

let cachedClient: OpenAI | null = null;

export async function getOpenAIClient(): Promise<OpenAI> {
  if (!cachedClient) {
    const apiKey = await resolveSecretValue('OPENAI_API_KEY', { scope: 'repo', required: true });
    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 90000);
    cachedClient = new OpenAI({ apiKey, timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined });
  }
  return cachedClient;
}
