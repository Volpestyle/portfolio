import {
  createExperienceEmbeddingSemanticRanker,
  type EmbeddingProvider,
  type ExperienceRepository,
  type ExperienceSemanticRanker,
} from '@portfolio/chat-data';
import { createOpenAIEmbeddingProvider } from './embedding';

const DEFAULT_EXPERIENCE_EMBEDDING_MODEL = 'text-embedding-3-large';
const DEFAULT_EXPERIENCE_SEMANTIC_SCORE = 8;

type CreateExperienceSemanticRankerOptions = {
  experienceRepository: ExperienceRepository;
  embeddingProvider?: EmbeddingProvider | null;
  getEmbeddingClient?: () => Promise<import('openai').OpenAI | null>;
  scoreScale?: number;
  embeddingModel?: string;
};

export function createExperienceSemanticRanker(
  options: CreateExperienceSemanticRankerOptions
): ExperienceSemanticRanker {
  const { experienceRepository, embeddingProvider, getEmbeddingClient, scoreScale, embeddingModel } = options;

  const resolvedEmbeddingProvider =
    embeddingProvider ??
    (getEmbeddingClient
      ? createOpenAIEmbeddingProvider({
          model: embeddingModel?.trim() || DEFAULT_EXPERIENCE_EMBEDDING_MODEL,
          getClient: getEmbeddingClient,
          logScope: 'chat-resume-search',
        })
      : {
          async embedTexts(texts: string[]): Promise<number[][]> {
            return texts.map(() => []);
          },
        });

  return createExperienceEmbeddingSemanticRanker({
    embeddingProvider: resolvedEmbeddingProvider,
    experienceRepository,
    scoreScale: typeof scoreScale === 'number' ? scoreScale : DEFAULT_EXPERIENCE_SEMANTIC_SCORE,
  });
}

export type { ExperienceSemanticRanker };
