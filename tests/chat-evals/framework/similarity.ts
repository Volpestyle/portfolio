// Semantic similarity computation using embeddings

import type OpenAI from 'openai';
import { estimateCostUsd, parseUsage, type TokenUsage } from '@portfolio/chat-contract';
import type { PipelineUsage, SimilarityResult } from './types';

const buildUsage = (stage: string, model: string, usage: TokenUsage | null): PipelineUsage | undefined => {
  if (!usage) return undefined;
  const costUsd = estimateCostUsd(model, usage);
  if (usage.totalTokens <= 0 && costUsd === null) return undefined;
  return {
    stage,
    model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    costUsd: costUsd ?? undefined,
  };
};

export async function getEmbedding(
  client: OpenAI,
  text: string,
  model: string,
  stage: string
): Promise<{ embedding: number[]; usage?: PipelineUsage }> {
  const response = await client.embeddings.create({
    model,
    input: text,
  });
  const usage = parseUsage(response.usage, { allowZero: true });
  return {
    embedding: response.data[0]!.embedding,
    usage: buildUsage(stage, model, usage),
  };
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
): Promise<SimilarityResult> {
  const [actualEmb, goldenEmb] = await Promise.all([
    getEmbedding(client, actual, model, 'similarity:actual'),
    getEmbedding(client, golden, model, 'similarity:golden'),
  ]);

  const similarity = cosineSimilarity(actualEmb.embedding, goldenEmb.embedding);
  const usage: PipelineUsage[] = [];
  if (actualEmb.usage) usage.push(actualEmb.usage);
  if (goldenEmb.usage) usage.push(goldenEmb.usage);
  const totalCostUsd = usage.reduce((sum, u) => sum + (u.costUsd ?? 0), 0);

  return {
    similarity,
    usage: usage.length ? usage : undefined,
    costUsd: totalCostUsd || undefined,
  };
}
