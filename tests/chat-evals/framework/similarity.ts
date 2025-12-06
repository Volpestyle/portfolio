// Semantic similarity computation using embeddings

import type OpenAI from 'openai';

export async function getEmbedding(client: OpenAI, text: string, model: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model,
    input: text,
  });
  return response.data[0]!.embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function computeSemanticSimilarity(
  client: OpenAI,
  actual: string,
  golden: string,
  model: string
): Promise<number> {
  const [actualEmb, goldenEmb] = await Promise.all([
    getEmbedding(client, actual, model),
    getEmbedding(client, golden, model),
  ]);
  return cosineSimilarity(actualEmb, goldenEmb);
}
