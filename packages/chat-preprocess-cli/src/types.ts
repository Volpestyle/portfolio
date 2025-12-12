import type { LoadedEnvFile } from './env';
import type { PreprocessMetrics } from './metrics';

export type PreprocessTaskResult = {
  description?: string;
  counts?: Array<{ label: string; value: number }>;
  artifacts?: Array<{ path: string; note?: string }>;
};

export type RepoFilterConfig = {
  gistId?: string;
  include?: string[];
  exclude?: string[];
};

export type ArtifactWriterConfig = { type: 's3'; bucket: string; prefix?: string; region?: string; kmsKeyId?: string };

export type PreprocessModelConfig = {
  /**
   * Default text model for structured outputs (repo facts, narratives, resume parsing).
   */
  textModel?: string;
  /**
   * Override text model for project summarization/facts.
   */
  projectTextModel?: string;
  /**
   * Override text model for resume PDF extraction/parsing.
   */
  resumeTextModel?: string;
  /**
   * Default embedding model (projects + resume).
   */
  embeddingModel?: string;
  /**
   * Override embedding model for project embeddings.
   */
  projectEmbeddingModel?: string;
  /**
   * Override embedding model for resume embeddings.
   */
  resumeEmbeddingModel?: string;
};

export type ResolvedModelConfig = {
  projectTextModel: string;
  resumeTextModel: string;
  projectEmbeddingModel: string;
  resumeEmbeddingModel: string;
  embeddingModel: string;
};

export type ChatPreprocessConfig = {
  /**
   * LLM provider for text-generation tasks (resume parsing, repo enrichment).
   * Embeddings remain OpenAI for now.
   */
  provider?: 'openai' | 'anthropic';
  /**
   * List of env files to load before running tasks.
   */
  envFiles?: string[];
  /**
   * File-system override knobs.
   */
  paths?: Partial<PreprocessPathOverrides>;
  repos?: RepoFilterConfig;
  artifacts?: {
    writers?: ArtifactWriterConfig[];
  };
  models?: PreprocessModelConfig;
  resume?: {
    filename?: string;
    /**
     * Optional regex (string or array) to treat certain skill entries as containers to be expanded into child skills.
     */
    skillContainerPatterns?: Array<string | RegExp> | string | RegExp;
  };
};

export type PreprocessPathOverrides = {
  rootDir: string;
  generatedDir: string;
  dataDir: string;
  resumePdf: string;
  resumeJson: string;
  profileSource: string;
  experiencesOutput: string;
  profileOutput: string;
  projectsOutput: string;
  projectsEmbeddingsOutput: string;
  resumeEmbeddingsOutput: string;
  personaOutput: string;
};

export type PreprocessPaths = PreprocessPathOverrides;

export type RepoMatcher = {
  owner?: string;
  name: string;
};

export type ResolvedRepoSelection = {
  gistId?: string;
  include: RepoMatcher[];
  exclude: RepoMatcher[];
};

export type ResolvedPreprocessConfig = {
  provider: 'openai' | 'anthropic';
  envFiles: string[];
  paths: PreprocessPaths;
  repos: ResolvedRepoSelection;
  artifacts: {
    writerConfigs: ArtifactWriterConfig[];
  };
  models: ResolvedModelConfig;
  resume: {
    filename: string;
    skillContainerPatterns: RegExp[];
  };
};

export type ArtifactWriteResult = {
  id: string;
  absolutePath: string;
  relativePath: string;
};

export type ArtifactManager = {
  writeJson: (input: { id: string; filePath: string; data: unknown }) => Promise<ArtifactWriteResult>;
};

export type PreprocessContext = {
  config: ResolvedPreprocessConfig;
  paths: PreprocessPaths;
  models: ResolvedModelConfig;
  envFiles: LoadedEnvFile[];
  repoSelection: ResolvedRepoSelection;
  artifacts: ArtifactManager;
  metrics: PreprocessMetrics;
};

export type CliTask = {
  name: string;
  label: string;
  run: (context: PreprocessContext) => Promise<PreprocessTaskResult>;
};
