import OpenAI from 'openai';
import { resolveSecretValue } from '@/lib/secrets/manager';

let cachedClient: OpenAI | null = null;

export async function getOpenAIClient(): Promise<OpenAI> {
  if (!cachedClient) {
    const apiKey = await resolveSecretValue('OPENAI_API_KEY', { scope: 'repo', required: true });
    cachedClient = new OpenAI({ apiKey, timeout: 60000 });
  }
  return cachedClient;
}
