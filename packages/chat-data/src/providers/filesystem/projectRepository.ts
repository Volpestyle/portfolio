import { assertProjectDataset, assertProjectEmbeddings, type EmbeddingIndex, type ProjectRecord } from '../../index';
import type { ProjectRepository, ProjectSearchIndexEntry } from '../types';

type FilesystemProjectRepositoryOptions = {
  datasetFile: unknown;
  embeddingsFile?: unknown;
};

type IndexedProject = {
  project: ProjectRecord;
  searchableText: string;
};

function normalizeKey(value: string): string {
  return value.toLowerCase().trim();
}

function pushValue(parts: string[], value?: string | null) {
  if (!value) {
    return;
  }
  parts.push(value);
}

function pushList(parts: string[], values?: string[] | null) {
  if (!Array.isArray(values) || values.length === 0) {
    return;
  }
  for (const value of values) {
    pushValue(parts, value);
  }
}

function buildSearchableText(project: ProjectRecord): string {
  const parts: string[] = [];
  pushValue(parts, project.id);
  pushValue(parts, project.slug);
  pushValue(parts, project.name);
  pushValue(parts, project.oneLiner);
  pushValue(parts, project.description);
  pushList(parts, project.techStack);
  pushList(parts, project.languages);
  pushList(parts, project.tags);
  pushList(parts, project.bullets);
  pushValue(parts, project.githubUrl);
  pushValue(parts, project.liveUrl);
  pushValue(parts, project.context.organization);
  pushValue(parts, project.context.role);
  pushValue(parts, project.context.type);
  pushValue(parts, project.context.timeframe?.start);
  pushValue(parts, project.context.timeframe?.end);
  pushValue(parts, project.embeddingId);
  pushValue(parts, project.readme);

  return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

function createIndexedProjects(projects: ProjectRecord[]): IndexedProject[] {
  return projects.map((project) => ({
    project,
    searchableText: buildSearchableText(project),
  }));
}

function sanitizeToken(token: string): string {
  return token
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[^\p{L}\p{N}]+$/gu, '')
    .trim();
}

function tokenizeQuery(query: string): string[] {
  const normalized = query.toLowerCase().trim();
  if (!normalized) {
    return [];
  }
  const tokens = normalized
    .split(/\s+/)
    .map((token) => sanitizeToken(token))
    .filter((token) => token.length > 0);
  return Array.from(new Set(tokens));
}

function searchProjectIndex(query: string, index: IndexedProject[]): ProjectSearchIndexEntry[] {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) {
    return index.map(({ project }) => ({ project, score: 0 }));
  }

  return index
    .map((entry) => {
      let score = 0;
      for (const token of tokens) {
        if (entry.searchableText.includes(token)) {
          score += 1;
        }
      }
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry, score }) => ({ project: entry.project, score }));
}

export function createFilesystemProjectRepository(options: FilesystemProjectRepositoryOptions): ProjectRepository {
  const dataset = assertProjectDataset(options.datasetFile);
  const embeddingIndex: EmbeddingIndex | null = options.embeddingsFile
    ? assertProjectEmbeddings(options.embeddingsFile)
    : null;

  const projects = dataset.projects;
  const projectsBySlug = new Map(projects.map((project) => [normalizeKey(project.slug), project]));
  const projectsByName = new Map(projects.map((project) => [normalizeKey(project.name), project]));
  const embeddingsById = new Map(
    (embeddingIndex?.entries ?? []).map((record) => [normalizeKey(record.id), record.vector])
  );

  const searchIndex = createIndexedProjects(projects);

  return {
    async listProjects() {
      return projects;
    },
    async getProjectBySlug(slug) {
      return projectsBySlug.get(normalizeKey(slug));
    },
    async getProjectByName(name) {
      return projectsByName.get(normalizeKey(name));
    },
    async searchIndex(query) {
      return searchProjectIndex(query, searchIndex);
    },
    async getEmbedding(project) {
      const key = normalizeKey(project.embeddingId ?? project.name);
      return embeddingsById.get(key);
    },
  };
}
