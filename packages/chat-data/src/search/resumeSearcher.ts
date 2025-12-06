import type { ResumeEntry, ExperienceRecord } from '@portfolio/chat-contract';
import { normalizeValue, includesText } from './utils';
import {
  createSearcher,
  type SearchLogPayload,
  type SearchSpec,
  type SearchContext,
  type SearchWeights,
} from './createSearcher';
import type { ExperienceSemanticRanker } from './experienceSemantic';
import { tokenizeWeighted } from './tokens';
import { createMiniSearchIndex, runMiniSearch } from './minisearch';

export type ResumeSearchQuery = {
  company?: string;
  title?: string;
  skill?: string;
  text?: string;
  limit?: number;
};

type NormalizedResumeFilters = {
  company?: string;
  title?: string;
  skill?: string;
  text: string;
};

type ResumeSearchLogFilters = {
  company?: string;
  title?: string;
  skill?: string;
  text: string;
};

export type ResumeSearchLogPayload = ResumeSearchLogFilters & {
  limit: number;
  structuredCandidates: number;
  matchedCount: number;
  expandedCandidates: number;
  usedSemantic: boolean;
  topScore?: number;
  topRawScore?: number;
  normalizationFactor?: number;
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
  weights?: SearchWeights;
};

const normalizeFilters = (input?: ResumeSearchQuery): NormalizedResumeFilters => ({
  company: normalizeValue(input?.company) || undefined,
  title: normalizeValue(input?.title) || undefined,
  skill: normalizeValue(input?.skill) || undefined,
  text: normalizeValue(input?.text),
});

const describeFilters = (filters: NormalizedResumeFilters): ResumeSearchLogFilters => ({
  company: filters.company,
  title: filters.title,
  skill: filters.skill,
  text: filters.text,
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
    const skillBag = record.type === 'skill' ? [record.name, ...(record.skills ?? [])] : (record.skills ?? []);
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
    const skillBag = record.type === 'skill' ? [record.name, ...(record.skills ?? [])] : (record.skills ?? []);
    if (skillBag.some((s) => includesText(s, filters.skill!))) {
      score += 2;
    }
  }
  return score;
};

const resolveTypeBias = (record: ResumeEntry): number => {
  const type = record.type ?? 'experience';
  if (type === 'experience') return 0.2;
  if (type === 'education') return 0.12;
  if (type === 'award') return 0.05;
  return 0;
};

const applyTypeBias = (records: ResumeEntry[], limit?: number): ResumeEntry[] => {
  if (!records.length) {
    return records;
  }
  const scored = records.map((record) => {
    const baseScore = (record as { _score?: number })._score ?? 0;
    const biasedScore = baseScore + resolveTypeBias(record);
    return { record, biasedScore };
  });

  const maxScore = scored.reduce((max, entry) => Math.max(max, entry.biasedScore), 0);

  return scored
    .sort((a, b) => {
      if (b.biasedScore !== a.biasedScore) {
        return b.biasedScore - a.biasedScore;
      }
      const aId = (a.record as { id?: string }).id ?? '';
      const bId = (b.record as { id?: string }).id ?? '';
      return aId.localeCompare(bId);
    })
    .slice(0, limit ?? scored.length)
    .map(({ record, biasedScore }) => ({
      ...record,
      _score: maxScore > 0 ? biasedScore / maxScore : (record as { _score?: number })._score ?? 0,
    }));
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
      const locationLike =
        'location' in record && typeof (record as { location?: string }).location === 'string'
          ? (record as { location?: string }).location
          : undefined;
      const bullets = record.type === 'skill' ? [] : (record.bullets ?? []);

      const tokens = tokenizeWeighted([
        { value: companyLike, weight: 3 },
        { value: titleLike, weight: 3 },
        { value: record.summary ?? '', weight: 2 },
        { value: locationLike, weight: 2 },
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
      weights: options?.weights,
      logger: logger
        ? (payload: SearchLogPayload<NormalizedResumeFilters>) => {
              const described = describeFilters(payload.filters);
              logger({
                company: described.company,
                title: described.title,
                skill: described.skill,
                text: described.text,
              limit: payload.limit,
              structuredCandidates: payload.structuredCandidates,
              matchedCount: payload.matchedCount,
              expandedCandidates: payload.expandedCandidates,
              usedSemantic: payload.usedSemantic,
              topScore: payload.topScore,
              topRawScore: payload.topRawScore,
              normalizationFactor: payload.normalizationFactor,
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
      const results = await search({ ...input, limit: requestedLimit });
      return applyTypeBias(results, requestedLimit);
    },
  };
}
