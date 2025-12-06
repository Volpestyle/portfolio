import type { ResumeEntry } from '@portfolio/chat-contract';
import type { EmbeddingProvider, ExperienceRepository } from '../providers/types';
import { cosineSimilarity } from './semantic';

export type ExperienceSemanticRanker = {
  scoreExperiences(records: ResumeEntry[], query: string): Promise<Map<string, number>>;
};

type ExperienceEmbeddingSemanticRankerOptions = {
  embeddingProvider: EmbeddingProvider;
  experienceRepository: Pick<ExperienceRepository, 'getEmbedding'>;
  scoreScale?: number;
};

function normalizeQuery(query: string): string {
  return typeof query === 'string' ? query.trim() : '';
}

export function createExperienceEmbeddingSemanticRanker(
  options: ExperienceEmbeddingSemanticRankerOptions
): ExperienceSemanticRanker {
  const { embeddingProvider, experienceRepository, scoreScale = 8 } = options;

  return {
    async scoreExperiences(records, query) {
      if (!records.length) {
        return new Map();
      }

      const normalized = normalizeQuery(query);
      if (!normalized) {
        return new Map();
      }

      const embeddings = await embeddingProvider.embedTexts([normalized]);
      const queryEmbedding = embeddings[0];
      if (!queryEmbedding?.length) {
        return new Map();
      }

      const scores = new Map<string, number>();
      for (const record of records) {
        const recordEmbedding = experienceRepository.getEmbedding
          ? await experienceRepository.getEmbedding(record)
          : undefined;
        if (!recordEmbedding?.length) {
          continue;
        }
        const similarity = cosineSimilarity(queryEmbedding, recordEmbedding);
        if (similarity > 0) {
          scores.set(record.id, similarity * scoreScale);
        }
      }

      return scores;
    },
  };
}
