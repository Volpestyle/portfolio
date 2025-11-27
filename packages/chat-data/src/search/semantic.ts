import type { ProjectRecord } from '../index';
import type { EmbeddingProvider, ProjectRepository } from '../providers/types';

export type SemanticRanker = {
  /**
   * Compute similarity scores for the provided projects given the natural-language query.
   */
  scoreProjects(projects: ProjectRecord[], query: string): Promise<Map<string, number>>;
};

export type EmbeddingSemanticRankerOptions = {
  embeddingProvider: EmbeddingProvider;
  projectRepository: Pick<ProjectRepository, 'getEmbedding'>;
  scoreScale?: number;
};

function normalizeQuery(query: string): string {
  return typeof query === 'string' ? query.trim() : '';
}

export function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (!a?.length || !b?.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const valA = a[i]!;
    const valB = b[i]!;
    dot += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  }

  if (!magA || !magB) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function createEmbeddingSemanticRanker(
  options: EmbeddingSemanticRankerOptions
): SemanticRanker {
  const { embeddingProvider, projectRepository, scoreScale = 12 } = options;

  return {
    async scoreProjects(projects, query) {
      if (!projects.length) {
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
      for (const project of projects) {
        const projectEmbedding = projectRepository.getEmbedding
          ? await projectRepository.getEmbedding(project)
          : undefined;
        if (!projectEmbedding?.length) {
          continue;
        }
        const similarity = cosineSimilarity(queryEmbedding, projectEmbedding);
        if (similarity > 0) {
          scores.set(project.id, similarity * scoreScale);
        }
      }

      return scores;
    },
  };
}

