import {
  createEmbeddingSemanticRanker,
  type EmbeddingProvider,
  type ProjectRepository,
  type SemanticRanker,
} from '@portfolio/chat-data';
import { createOpenAIEmbeddingProvider } from './embedding';

const DEFAULT_PROJECT_EMBEDDING_MODEL = 'text-embedding-3-large';
const DEFAULT_PROJECT_SEMANTIC_SCORE = 12;

type CreateSemanticRankerOptions = {
  projectRepository: ProjectRepository;
  embeddingProvider?: EmbeddingProvider | null;
  getEmbeddingClient?: () => Promise<import('openai').OpenAI | null>;
  scoreScale?: number;
  embeddingModel?: string;
};

export function createSemanticRanker(options: CreateSemanticRankerOptions): SemanticRanker {
  const { projectRepository, embeddingProvider, getEmbeddingClient, scoreScale, embeddingModel } = options;

  const resolvedEmbeddingProvider =
    embeddingProvider ??
    (getEmbeddingClient
      ? createOpenAIEmbeddingProvider({
          model: embeddingModel?.trim() || DEFAULT_PROJECT_EMBEDDING_MODEL,
          getClient: getEmbeddingClient,
          logScope: 'chat-project-search',
        })
      : {
          async embedTexts(texts: string[]): Promise<number[][]> {
            return texts.map(() => []);
          },
        });

  return createEmbeddingSemanticRanker({
    embeddingProvider: resolvedEmbeddingProvider,
    projectRepository,
    scoreScale: typeof scoreScale === 'number' ? scoreScale : DEFAULT_PROJECT_SEMANTIC_SCORE,
  });
}

export type { SemanticRanker };
