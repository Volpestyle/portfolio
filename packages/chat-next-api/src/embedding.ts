import type OpenAI from 'openai';
import type { EmbeddingProvider } from '@portfolio/chat-data';

type EmbeddingClient = OpenAI | null;

export function createOpenAIEmbeddingProvider(params: {
  model: string;
  getClient: () => Promise<EmbeddingClient>;
  logScope: string;
}): EmbeddingProvider {
  const { model, getClient, logScope } = params;
  return {
    async embedTexts(texts: string[]): Promise<number[][]> {
      if (!texts.length) {
        return [];
      }
      let client: EmbeddingClient;
      try {
        client = await getClient();
      } catch (error) {
        console.warn(`[${logScope}] Failed to resolve embedding client.`, error);
        return texts.map(() => []);
      }
      if (!client) {
        return texts.map(() => []);
      }
      try {
        const response = await client.embeddings.create({
          model,
          input: texts,
        });
        return response.data.map((item) => item.embedding ?? []);
      } catch (error) {
        console.warn(`[${logScope}] Query embedding failed.`, error);
        return texts.map(() => []);
      }
    },
  };
}
