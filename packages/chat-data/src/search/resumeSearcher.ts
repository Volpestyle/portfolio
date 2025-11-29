import type { ResumeEntry, ExperienceRecord, ResumeFacet } from '@portfolio/chat-contract';
import { normalizeValue, includesText } from './utils';
import { createSearcher, type SearchLogPayload, type SearchSpec, type SearchContext } from './createSearcher';
import type { ExperienceSemanticRanker } from './experienceSemantic';
import { tokenizeWeighted } from './tokens';
import { createMiniSearchIndex, runMiniSearch } from './minisearch';

export type ResumeSearchQuery = {
  company?: string;
  title?: string;
  skill?: string;
  text?: string;
  limit?: number;
  facets?: ResumeFacet[];
};

type NormalizedResumeFilters = {
  company?: string;
  title?: string;
  skill?: string;
  text: string;
  facets?: ResumeFacet[];
};

type ResumeSearchLogFilters = {
  company?: string;
  title?: string;
  skill?: string;
  text: string;
  facets?: ResumeFacet[];
};

export type ResumeSearchLogPayload = ResumeSearchLogFilters & {
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

export type ResumeSearcher = {
  searchResume(input?: ResumeSearchQuery): Promise<ResumeEntry[]>;
};

export type ResumeSearcherOptions = {
  searchIndex?: (query: string) => Promise<{ record: ResumeEntry; score: number }[]>;
  semanticRanker?: ExperienceSemanticRanker | null;
  defaultLimit?: number;
  minLimit?: number;
  maxLimit?: number;
  logger?: (payload: ResumeSearchLogPayload) => void;
  getNow?: () => number;
};

const normalizeFacets = (facets?: ResumeFacet[]) =>
  Array.isArray(facets) && facets.length ? Array.from(new Set(facets.filter((facet): facet is ResumeFacet => Boolean(facet)))) : undefined;

const normalizeFilters = (input?: ResumeSearchQuery): NormalizedResumeFilters => ({
  company: normalizeValue(input?.company) || undefined,
  title: normalizeValue(input?.title) || undefined,
  skill: normalizeValue(input?.skill) || undefined,
  text: normalizeValue(input?.text),
  facets: normalizeFacets(input?.facets),
});

const describeFilters = (filters: NormalizedResumeFilters): ResumeSearchLogFilters => ({
  company: filters.company,
  title: filters.title,
  skill: filters.skill,
  text: filters.text,
  facets: filters.facets,
});

const parseResumeDate = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const resolveResumeRecencyTimestamp = (record: ResumeEntry, now: number): number | null => {
  if ('isCurrent' in record && record.isCurrent) {
    return now;
  }
  if ('endDate' in record) {
    const endTimestamp = parseResumeDate((record as { endDate?: string | null }).endDate);
    if (endTimestamp !== null) {
      return endTimestamp;
    }
  }
  if ('startDate' in record) {
    const startTimestamp = parseResumeDate((record as { startDate?: string | null }).startDate);
    if (startTimestamp !== null) {
      return startTimestamp;
    }
  }
  if (record.type === 'award') {
    return parseResumeDate(record.date);
  }
  return null;
};

function recordMatchesFilters(record: ResumeEntry, filters: NormalizedResumeFilters): boolean {
  const companyLike =
    record.type === 'education'
      ? record.institution
      : record.type === 'award'
        ? record.issuer
        : record.type === 'skill'
          ? record.name
          : record.company;

  if (filters.company && !(companyLike && includesText(companyLike, filters.company))) {
    return false;
  }
  const titleLike =
    record.type === 'education'
      ? [record.degree, record.field].filter(Boolean).join(' ')
      : record.type === 'award'
        ? record.title
        : record.type === 'skill'
          ? record.name
          : record.title;
  if (filters.title && !(titleLike && includesText(titleLike, filters.title))) {
    return false;
  }
  if (filters.skill) {
    const skillBag =
      record.type === 'skill'
        ? [record.name, ...(record.skills ?? [])]
        : record.skills ?? [];
    if (!skillBag.some((s) => includesText(s, filters.skill!))) {
      return false;
    }
  }
  return true;
}

const computeStructuredScore = (record: ResumeEntry, filters: NormalizedResumeFilters): number => {
  let score = 0;
  const companyLike =
    record.type === 'education'
      ? record.institution
      : record.type === 'award'
        ? record.issuer
        : record.type === 'skill'
          ? record.name
          : record.company;
  const titleLike =
    record.type === 'education'
      ? [record.degree, record.field].filter(Boolean).join(' ')
      : record.type === 'award'
        ? record.title
        : record.type === 'skill'
          ? record.name
          : record.title;

  if (filters.company && companyLike && includesText(companyLike, filters.company)) {
    score += 4;
  }
  if (filters.title && titleLike && includesText(titleLike, filters.title)) {
    score += 3;
  }
  if (filters.skill) {
    const skillBag =
      record.type === 'skill'
        ? [record.name, ...(record.skills ?? [])]
        : record.skills ?? [];
    if (skillBag.some((s) => includesText(s, filters.skill!))) {
      score += 2;
    }
  }
  return score;
};

const resolveFacet = (record: ResumeEntry): ResumeFacet => {
  if (record.type === 'education') return 'education';
  if (record.type === 'award') return 'award';
  if (record.type === 'skill') return 'skill';
  return 'experience';
};

const applyFacetBias = (records: ResumeEntry[], facets?: ResumeFacet[], limit?: number): ResumeEntry[] => {
  if (!facets?.length) return records.slice(0, limit ?? records.length);
  const facetSet = new Set(facets);
  return records
    .map((record) => ({
      record,
      facetBoost: facetSet.has(resolveFacet(record)) ? 1 : 0,
      score: (record as { _score?: number })._score ?? 0,
    }))
    .sort((a, b) => {
      if (b.facetBoost !== a.facetBoost) {
        return b.facetBoost - a.facetBoost;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return 0;
    })
    .slice(0, limit ?? records.length)
    .map(({ record }) => record);
};

const buildCombinedTextQuery = (filters: NormalizedResumeFilters): string => filters.text;

const buildSemanticQuery = (input: ResumeSearchQuery | undefined, filters: NormalizedResumeFilters): string => {
  const rawText = typeof input?.text === 'string' ? input.text.trim() : '';
  if (rawText.length) {
    return rawText;
  }
  return filters.text;
};

export function buildResumeSearchIndex(records: ResumeEntry[]) {
  const miniSearchIndex = createMiniSearchIndex(
    records.map((record) => {
      const experienceRecord = record.type === 'experience' ? (record as ExperienceRecord) : null;
      const companyLike =
        record.type === 'education'
          ? record.institution
          : record.type === 'award'
            ? record.issuer
            : record.type === 'skill'
              ? record.name
              : experienceRecord?.company;
      const titleLike =
        record.type === 'education'
          ? [record.degree, record.field].filter(Boolean).join(' ')
          : record.type === 'award'
            ? record.title
            : record.type === 'skill'
              ? record.name
              : experienceRecord?.title;
      const bullets = record.type === 'skill' ? [] : record.bullets ?? [];

      const tokens = tokenizeWeighted([
        { value: companyLike, weight: 3 },
        { value: titleLike, weight: 3 },
        { value: record.summary ?? '', weight: 2 },
        { value: bullets, weight: 2 },
        { value: record.skills ?? [], weight: 2 },
      ]);
      return { id: record.id, text: tokens.join(' ') };
    })
  );

  return async (query: string) => {
    const lexical = runMiniSearch(miniSearchIndex, query);
    return lexical
      .map(({ id, score }) => {
        const record = records.find((rec) => rec.id === id);
        return record ? { record, score } : null;
      })
      .filter((entry): entry is { record: ResumeEntry; score: number } => Boolean(entry));
  };
}

const createResumeSearchSpec = (): SearchSpec<
  ResumeEntry,
  ResumeSearchQuery | undefined,
  NormalizedResumeFilters,
  ResumeEntry
> => ({
  normalizeInput: normalizeFilters,
  hasStructuredFilters(filters) {
    return Boolean(filters.company || filters.title || filters.skill);
  },
  recordMatches: recordMatchesFilters,
  computeStructuredScore,
  buildCombinedTextQuery,
  buildSemanticQuery,
  getId: (record) => record.id,
  buildResult: (record) => record,
  describeFilters,
  hasQueryTerms(filters, context: SearchContext<NormalizedResumeFilters>) {
    void context;
    if (this.hasStructuredFilters(filters)) {
      return true;
    }
    return Boolean(filters.text);
  },
  getRecencyTimestamp(record, context) {
    return resolveResumeRecencyTimestamp(record, context.now);
  },
});

const toSemanticRanker = (semanticRanker?: ExperienceSemanticRanker | null) => {
  if (!semanticRanker) {
    return undefined;
  }
  return (records: readonly ResumeEntry[], query: string) =>
    semanticRanker.scoreExperiences(Array.from(records), query);
};

export function createResumeSearcher(records: ResumeEntry[], options?: ResumeSearcherOptions): ResumeSearcher {
  const spec = createResumeSearchSpec();
  const { defaultLimit = 15, minLimit = 1, maxLimit = 25, logger } = options ?? {};
  const searchIndex = options?.searchIndex ?? buildResumeSearchIndex(records);

  const { search } = createSearcher<ResumeEntry, ResumeSearchQuery | undefined, NormalizedResumeFilters, ResumeEntry>({
    records,
    spec,
    options: {
      searchIndex,
      semanticRanker: toSemanticRanker(options?.semanticRanker ?? null),
      defaultLimit,
      minLimit,
      maxLimit,
      getLimit: (input) => input?.limit,
      getNow: options?.getNow,
      logger: logger
        ? (payload: SearchLogPayload<NormalizedResumeFilters>) => {
            const described = describeFilters(payload.filters);
            logger({
              company: described.company,
              title: described.title,
              skill: described.skill,
              text: described.text,
              facets: described.facets,
              limit: payload.limit,
              structuredCandidates: payload.structuredCandidates,
              matchedCount: payload.matchedCount,
              expandedCandidates: payload.expandedCandidates,
              usedSemantic: payload.usedSemantic,
              topScore: payload.topScore,
              recencyLambda: payload.recencyLambda,
              freshestTimestamp: payload.freshestTimestamp ?? null,
              topRecencyScore: payload.topRecencyScore,
              rawTextMatches: payload.rawTextMatches,
              candidateCount: payload.candidateCount,
              scoredCandidates: payload.scoredCandidates,
            });
          }
        : undefined,
    },
  });

  return {
    async searchResume(input?: ResumeSearchQuery): Promise<ResumeEntry[]> {
      const requestedLimit = input?.limit ?? defaultLimit;
      const facetAwareLimit =
        input?.facets?.length && requestedLimit < maxLimit ? Math.min(requestedLimit + 4, maxLimit) : requestedLimit;
      const results = await search({ ...input, limit: facetAwareLimit });
      return applyFacetBias(results, input?.facets, requestedLimit);
    },
  };
}
