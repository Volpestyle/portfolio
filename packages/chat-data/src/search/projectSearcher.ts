import type { ProjectSearchInput, ProjectSearchResult, Scored } from '@portfolio/chat-contract';
import type { ProjectRecord } from '../index';
import type { ProjectSearchIndexEntry } from '../providers/types';
import type { SemanticRanker } from './semantic';
import { buildProjectSearchResult } from '../projects';
import { tokenizeWeighted } from './tokens';
import {
  collectRawList,
  createNormalizedValueSet,
  dedupe,
  includesText,
  matchesAnyNormalizedTag,
  matchesAnyNormalizedValue,
  normalizeList,
  normalizeValue,
  normalizedTagMatches,
} from './utils';
import { createMiniSearchIndex, runMiniSearch } from './minisearch';
import { createSearcher, type SearchLogPayload, type SearchSpec } from './createSearcher';

type NormalizedProjectFilters = {
  languages: string[];
  techStack: string[];
  organization?: string;
  projectType?: string;
  text: string;
};

type ProjectSearchLogFilters = {
  text: string;
  languages: string[];
  techStack: string[];
  organization?: string;
  projectType?: string;
};

export type ProjectSearchLogPayload = ProjectSearchLogFilters & {
  limit: number;
  structuredCandidates: number;
  matchedCount: number;
  expandedCandidates: number;
  usedSemantic: boolean;
  topScore?: number;
  recencyLambda?: number;
  freshestTimestamp?: number | null;
  topRecencyScore?: number;
  rawTextMatches?: number;
  scoredCandidates?: number;
  candidateCount?: number;
};

export type ProjectSearcher = {
  searchProjects(input: ProjectSearchInput): Promise<Scored<ProjectSearchResult>[]>;
};

type ProjectSearcherOptions = {
  searchIndex?: (query: string) => Promise<ProjectSearchIndexEntry[]>;
  semanticRanker?: SemanticRanker | null;
  logger?: (payload: ProjectSearchLogPayload) => void;
  defaultLimit?: number;
  minLimit?: number;
  maxLimit?: number;
  getNow?: () => number;
};

const normalizeFilters = (input: ProjectSearchInput): NormalizedProjectFilters => ({
  languages: dedupe(normalizeList(input.languages)),
  techStack: dedupe(normalizeList(input.techStack)),
  organization: normalizeValue(input.organization) || undefined,
  projectType: normalizeValue(input.type) || undefined,
  text: normalizeValue(input.text),
});

const describeFilters = (filters: NormalizedProjectFilters): ProjectSearchLogFilters => ({
  text: filters.text,
  languages: filters.languages,
  techStack: filters.techStack,
  organization: filters.organization,
  projectType: filters.projectType,
});

const parseDateToTimestamp = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getProjectRecencyTimestamp = (project: ProjectRecord): number | null => {
  const timeframe = project.context?.timeframe;
  if (!timeframe) {
    return null;
  }
  return parseDateToTimestamp(timeframe.end) ?? parseDateToTimestamp(timeframe.start);
};

const recordMatchesFilters = (project: ProjectRecord, filters: NormalizedProjectFilters): boolean => {
  const projectLanguageSet = createNormalizedValueSet(project.languages);
  const projectTechStackSet = createNormalizedValueSet(project.techStack);
  if (!matchesAnyNormalizedValue(projectLanguageSet, filters.languages)) {
    return false;
  }
  if (!matchesAnyNormalizedTag(projectTechStackSet, filters.techStack)) {
    return false;
  }
  if (filters.organization && !includesText(project.context.organization, filters.organization)) {
    return false;
  }
  if (filters.projectType && project.context.type !== filters.projectType) {
    return false;
  }
  return true;
};

const computeStructuredScore = (project: ProjectRecord, filters: NormalizedProjectFilters): number => {
  let score = 0;
  const projectLanguageSet = createNormalizedValueSet(project.languages);
  const projectTechStackSet = createNormalizedValueSet(project.techStack);

  for (const lang of filters.languages) {
    if (projectLanguageSet.has(lang)) {
      score += 2;
    }
  }

  if (filters.techStack.length) {
    const techValues = Array.from(projectTechStackSet.values());
    for (const tech of filters.techStack) {
      if (techValues.some((value) => normalizedTagMatches(value, tech))) {
        score += 3;
      }
    }
  }

  if (filters.organization && includesText(project.context.organization, filters.organization)) {
    score += 4;
  }

  if (filters.projectType && project.context.type === filters.projectType) {
    score += 2;
  }

  return score;
};

const buildCombinedTextQuery = (filters: NormalizedProjectFilters): string => {
  const parts = [
    filters.text,
    ...filters.languages,
    ...filters.techStack,
    filters.organization,
    filters.projectType,
  ].filter(Boolean) as string[];
  return parts.join(' ').trim();
};

const buildSemanticQuery = (input: ProjectSearchInput, filters: NormalizedProjectFilters): string => {
  const parts: string[] = [];
  if (typeof input.text === 'string' && input.text.trim().length) {
    parts.push(input.text.trim());
  } else if (filters.text) {
    parts.push(filters.text);
  }

  for (const value of collectRawList(input.techStack)) {
    parts.push(value);
  }
  for (const value of collectRawList(input.languages)) {
    parts.push(value);
  }

  if (typeof input.organization === 'string' && input.organization.trim().length) {
    parts.push(input.organization.trim());
  } else if (filters.organization) {
    parts.push(filters.organization);
  }

  if (typeof input.type === 'string' && input.type.trim().length) {
    parts.push(input.type.trim());
  } else if (filters.projectType) {
    parts.push(filters.projectType);
  }

  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ')
    .trim();
};

const createProjectSearchSpec = (): SearchSpec<
  ProjectRecord,
  ProjectSearchInput,
  NormalizedProjectFilters,
  ProjectSearchResult
> => ({
  normalizeInput: normalizeFilters,
  hasStructuredFilters(filters) {
    return (
      filters.languages.length > 0 ||
      filters.techStack.length > 0 ||
      Boolean(filters.organization) ||
      Boolean(filters.projectType)
    );
  },
  recordMatches: recordMatchesFilters,
  computeStructuredScore,
  buildCombinedTextQuery,
  buildSemanticQuery,
  getId: (project) => project.id,
  buildResult: buildProjectSearchResult,
  hasQueryTerms(filters, _context) {
    void _context;
    return Boolean(filters.text) || this.hasStructuredFilters(filters);
  },
  describeFilters,
  getRecencyTimestamp(project, _context) {
    void _context;
    return getProjectRecencyTimestamp(project);
  },
});

const toSearchIndex = (fn?: (query: string) => Promise<ProjectSearchIndexEntry[]>) => {
  if (!fn) {
    return undefined;
  }
  return async (query: string) => {
    const entries = await fn(query);
    return entries.map((entry) => ({ record: entry.project, score: entry.score }));
  };
};

const toSemanticRanker = (semanticRanker?: SemanticRanker | null) => {
  if (!semanticRanker) {
    return undefined;
  }
  return (projects: readonly ProjectRecord[], query: string) =>
    semanticRanker.scoreProjects(Array.from(projects), query);
};

export function createProjectSearcher(records: ProjectRecord[], options?: ProjectSearcherOptions): ProjectSearcher {
  const spec = createProjectSearchSpec();
  const { defaultLimit, minLimit, maxLimit, logger } = options ?? {};
  const projectById = new Map(records.map((project) => [project.id, project]));

  const miniSearchIndex = createMiniSearchIndex(
    records.map((project) => {
      const tokens = tokenizeWeighted([
        { value: project.name, weight: 3 },
        { value: project.oneLiner, weight: 2 },
        { value: project.description, weight: 1 },
        { value: project.bullets, weight: 2 },
        { value: project.techStack, weight: 2 },
        { value: project.languages, weight: 2 },
        { value: project.tags, weight: 1 },
        { value: project.context.organization, weight: 1 },
        { value: project.context.role, weight: 1 },
      ]);
      return { id: project.id, text: tokens.join(' ') };
    })
  );

  const structuredSearchIndex = options?.searchIndex ? toSearchIndex(options.searchIndex) : undefined;

  const lexicalSearchIndex = async (query: string) => {
    const [bm25Results, structuredResults] = await Promise.all([
      Promise.resolve(runMiniSearch(miniSearchIndex, query)),
      structuredSearchIndex ? structuredSearchIndex(query) : Promise.resolve([]),
    ]);

    type CombinedEntry = {
      record: ProjectRecord;
      bm25Score?: number;
      bm25Rank?: number;
      structuredScore?: number;
      structuredRank?: number;
    };

    const combined = new Map<string, CombinedEntry>();
    const addEntry = (
      record: ProjectRecord,
      score: number,
      source: 'bm25' | 'structured',
      rank: number
    ) => {
      const normalized = projectById.get(record.id) ?? record;
      const existing = combined.get(normalized.id) ?? { record: normalized };
      if (source === 'bm25') {
        if (!existing.bm25Score || score > existing.bm25Score) {
          existing.bm25Score = score;
          existing.bm25Rank = rank;
        }
      } else {
        if (!existing.structuredScore || score > existing.structuredScore) {
          existing.structuredScore = score;
          existing.structuredRank = rank;
        }
      }
      combined.set(normalized.id, existing);
    };

    bm25Results.forEach(({ id, score }, index) => {
      const record = projectById.get(id);
      if (record) {
        addEntry(record, score, 'bm25', index);
      }
    });

    structuredResults.forEach(({ record, score }, index) => {
      addEntry(record, score, 'structured', index);
    });

    const merged = Array.from(combined.values())
      .map((entry) => {
        const totalScore = (entry.bm25Score ?? 0) + (entry.structuredScore ?? 0);
        return {
          record: entry.record,
          score: totalScore,
          bm25Score: entry.bm25Score ?? 0,
          bm25Rank: entry.bm25Rank ?? Number.MAX_SAFE_INTEGER,
          structuredScore: entry.structuredScore ?? 0,
          structuredRank: entry.structuredRank ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.bm25Score !== a.bm25Score) {
          return b.bm25Score - a.bm25Score;
        }
        if (a.bm25Rank !== b.bm25Rank) {
          return a.bm25Rank - b.bm25Rank;
        }
        if (b.structuredScore !== a.structuredScore) {
          return b.structuredScore - a.structuredScore;
        }
        return a.structuredRank - b.structuredRank;
      });

    return merged.map(({ record, score }) => ({ record, score }));
  };

  const { search: searchProjects } = createSearcher<
    ProjectRecord,
    ProjectSearchInput,
    NormalizedProjectFilters,
    ProjectSearchResult
  >({
    records,
    spec,
    options: {
      searchIndex: lexicalSearchIndex,
      semanticRanker: toSemanticRanker(options?.semanticRanker ?? null),
      defaultLimit: defaultLimit ?? 5,
      minLimit: minLimit ?? 1,
      maxLimit: maxLimit ?? 10,
      getLimit: (input) => input.limit,
      getNow: options?.getNow,
      logger: logger
        ? (payload: SearchLogPayload<NormalizedProjectFilters>) => {
            const filterDescription = (payload.filterDescription ?? {}) as Partial<ProjectSearchLogFilters>;
            logger({
              text: filterDescription.text ?? payload.filters.text ?? '',
              languages: filterDescription.languages ?? payload.filters.languages ?? [],
              techStack: filterDescription.techStack ?? payload.filters.techStack ?? [],
              organization: filterDescription.organization ?? payload.filters.organization,
              projectType: filterDescription.projectType ?? payload.filters.projectType,
              limit: payload.limit,
              structuredCandidates: payload.structuredCandidates,
              matchedCount: payload.matchedCount,
              expandedCandidates: payload.expandedCandidates,
              usedSemantic: payload.usedSemantic,
              topScore: payload.topScore,
              recencyLambda: payload.recencyLambda,
              freshestTimestamp: payload.freshestTimestamp ?? null,
              topRecencyScore: payload.topRecencyScore,
            });
          }
        : undefined,
    },
  });

  return {
    searchProjects,
  };
}
