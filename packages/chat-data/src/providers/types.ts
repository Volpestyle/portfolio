import type { ProfileSummary, ExperienceRecord, ProjectDetail, ResumeEntry } from '@portfolio/chat-contract';
import type { ProjectRecord, ResumeSearchQuery } from '../index';

export type ProjectSearchIndexEntry = {
  project: ProjectRecord;
  score: number;
};

export interface ProjectRepository {
  /**
   * Return the complete set of projects that should be available to the runtime.
   * Implementations may hydrate from JSON, a database, or an API.
   */
  listProjects(): Promise<ProjectRecord[]>;

  /**
   * Resolve a project by slug identifier, returning undefined when not found.
   */
  getProjectBySlug(slug: string): Promise<ProjectRecord | undefined>;

  /**
   * Resolve a project by friendly name alongside slug lookups.
   */
  getProjectByName(name: string): Promise<ProjectRecord | undefined>;

  /**
   * Optional hook for structured search. Implementations that cannot provide a search index
   * should return an empty array rather than throwing.
   */
  searchIndex?(query: string): Promise<ProjectSearchIndexEntry[]>;

  /**
   * Optional semantic embedding loader; used when scoring query similarity.
   */
  getEmbedding?(project: ProjectRecord): Promise<number[] | undefined>;
}

export interface ExperienceRepository {
  /**
   * Return resume/experience entries filtered by the provided query.
   */
  searchExperiences(
    query?: ResumeSearchQuery,
    options?: import('../index').ResumeSearcherOptions
  ): Promise<ResumeEntry[]>;

  /**
   * List all experiences available to the runtime. Useful for callers that want to build custom search strategies.
   */
  listExperiences(): Promise<ResumeEntry[]>;

  /**
   * Optional semantic embedding accessor used for LLM-powered ranking.
   */
  getEmbedding?(experience: ExperienceRecord): Promise<number[] | undefined>;
}

export interface ProfileRepository {
  /**
   * Fetch the canonical profile summary. Consumers may augment the result with fallback social links.
   */
  getProfile(): Promise<ProfileSummary>;
}

export interface EmbeddingProvider {
  /**
   * Generate embeddings for the given text chunks. Used by semantic ranking/search.
   */
  embedTexts(texts: string[]): Promise<number[][]>;
}

export type ProjectDetailProvider = {
  getProjectDetail(projectId: string): Promise<ProjectDetail>;
};

export type ProjectProviders = {
  repository: ProjectRepository;
  detail: ProjectDetailProvider;
};
