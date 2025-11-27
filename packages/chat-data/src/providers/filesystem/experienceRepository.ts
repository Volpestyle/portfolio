import { createHash } from 'crypto';
import {
  assertResume,
  assertExperienceEmbeddings,
  createResumeSearcher,
  buildResumeSearchIndex,
  type EmbeddingIndex,
  type ResumeEntry,
  type ResumeSearchQuery,
  type ResumeSearcherOptions,
} from '../../index';
import type { ExperienceRepository } from '../types';

type FilesystemExperienceRepositoryOptions = {
  datasetFile: unknown;
  defaultLimit?: number;
  embeddingsFile?: unknown;
};

function buildSourceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function createFilesystemExperienceRepository(
  options: FilesystemExperienceRepositoryOptions
): ExperienceRepository {
  const dataset = assertResume(options.datasetFile);
  const embeddingIndex: EmbeddingIndex | null = options.embeddingsFile
    ? assertExperienceEmbeddings(options.embeddingsFile)
    : null;

  const experiences = (dataset.experiences ?? []).map((exp) => ({ ...exp, type: 'experience' as const }));
  const education = (dataset.education ?? []).map((edu) => ({ ...edu, type: 'education' as const }));
  const awards = (dataset.awards ?? []).map((award) => ({ ...award, type: 'award' as const }));
  const skills = (dataset.skills ?? []).map((skill) => ({ ...skill, type: 'skill' as const }));
  const resumeEntries = [...experiences, ...education, ...awards, ...skills];

  const searchIndex = buildResumeSearchIndex(resumeEntries);
  const buildSearcher = (searcherOptions?: ResumeSearcherOptions) =>
    createResumeSearcher(resumeEntries, {
      defaultLimit: options.defaultLimit,
      searchIndex,
      ...searcherOptions,
    });
  const defaultSearcher = buildSearcher();
  const embeddingsById = new Map(
    (embeddingIndex?.entries ?? []).map((record) => [record.id.trim().toLowerCase(), record.vector])
  );

  if (embeddingIndex) {
    const sourceHash = buildSourceHash(dataset);
    if (embeddingIndex.meta.sourceHash !== sourceHash) {
      console.warn(
        `[chat-data] resume embeddings sourceHash mismatch — expected ${sourceHash} but got ${embeddingIndex.meta.sourceHash}`
      );
    }
  }

  return {
    async searchExperiences(query?: ResumeSearchQuery, searcherOptions?: ResumeSearcherOptions): Promise<ResumeEntry[]> {
      const searcher = searcherOptions ? buildSearcher(searcherOptions) : defaultSearcher;
      return searcher.searchResume(query);
    },
    async listExperiences(): Promise<ResumeEntry[]> {
      return resumeEntries;
    },
    async getEmbedding(entry: ResumeEntry): Promise<number[] | undefined> {
      const key = entry.id.trim().toLowerCase();
      return embeddingsById.get(key);
    },
  };
}
