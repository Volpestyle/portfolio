import type { Scored, ScoreMetadata } from '@portfolio/chat-contract';

const DEFAULT_RECENCY_LAMBDA = 0.2;
const TEXT_SCORE_WEIGHT = 0.3;
const SEMANTIC_SCORE_WEIGHT = 0.5;
const NEUTRAL_RECENCY_SCORE = 0.5;
const MONTH_IN_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_RECENCY_MONTHS = 60;

const clampMonths = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value > MAX_RECENCY_MONTHS) {
    return MAX_RECENCY_MONTHS;
  }
  return value;
};

const computeRecencyScore = (timestamp: number | null | undefined, now: number): number => {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return NEUTRAL_RECENCY_SCORE;
  }
  const delta = now - timestamp;
  if (!Number.isFinite(delta)) {
    return NEUTRAL_RECENCY_SCORE;
  }
  if (delta <= 0) {
    return 1;
  }
  const monthsOld = clampMonths(delta / MONTH_IN_MS);
  if (monthsOld >= MAX_RECENCY_MONTHS) {
    return 0;
  }
  return Math.max(0, 1 - monthsOld / MAX_RECENCY_MONTHS);
};

export type SearchContext<TFilters> = {
  filters: TFilters;
  hasStructuredFilters: boolean;
  combinedTextQuery: string;
  textScoreMap: Map<string, number>;
  semanticScoreMap: Map<string, number>;
};

export type SearchSpec<TRecord, TInput, TFilters, TResult> = {
  normalizeInput(input: TInput): TFilters;
  hasStructuredFilters(filters: TFilters): boolean;
  recordMatches(record: TRecord, filters: TFilters): boolean;
  computeStructuredScore(record: TRecord, filters: TFilters): number;
  buildCombinedTextQuery(filters: TFilters): string;
  buildSemanticQuery(input: TInput, filters: TFilters): string;
  getId(record: TRecord): string;
  buildResult(record: TRecord): TResult;
  hasQueryTerms?(filters: TFilters, context: SearchContext<TFilters>): boolean;
  describeFilters?(filters: TFilters): Record<string, unknown>;
  getRecencyTimestamp?(record: TRecord, context: { now: number }): number | null;
  recencyLambda?: number;
};

export type SearchIndexEntry<TRecord> = {
  record: TRecord;
  score: number;
};

export type SemanticScorer<TRecord> = (
  records: readonly TRecord[],
  query: string
) => Promise<Map<string, number>>;

export type SearchLogPayload<TFilters> = {
  filters: TFilters;
  filterDescription?: Record<string, unknown>;
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

export type SearcherOptions<TRecord, TInput, TFilters> = {
  searchIndex?: (query: string) => Promise<SearchIndexEntry<TRecord>[]>;
  semanticRanker?: SemanticScorer<TRecord> | null;
  logger?: (payload: SearchLogPayload<TFilters>) => void;
  defaultLimit?: number;
  minLimit?: number;
  maxLimit?: number;
  getLimit?: (input: TInput) => number | null | undefined;
  getNow?: () => number;
};

export function createSearcher<TRecord, TInput, TFilters, TResult>(config: {
  records: readonly TRecord[];
  spec: SearchSpec<TRecord, TInput, TFilters, TResult>;
  options?: SearcherOptions<TRecord, TInput, TFilters>;
}) {
  const { records, spec } = config;
  const options = config.options ?? {};
  const defaultLimit = options.defaultLimit ?? 5;
  const minLimit = options.minLimit ?? 1;
  const maxLimit = options.maxLimit ?? 10;
  const searchIndex = options.searchIndex;
  const semanticRanker = options.semanticRanker;
  const logger = options.logger;
  const getLimit = options.getLimit;
  const getNow = options.getNow ?? Date.now;

  const recordById = new Map<string, TRecord>();
  const recordOrder = new Map<string, number>();
  for (const record of records) {
    recordById.set(spec.getId(record), record);
    recordOrder.set(spec.getId(record), recordOrder.size);
  }

  const resolveRecord = (record: TRecord): TRecord => {
    const id = spec.getId(record);
    const existing = recordById.get(id);
    if (existing) {
      return existing;
    }
    recordById.set(id, record);
    return record;
  };

  const clampLimit = (value: number): number => {
    if (!Number.isFinite(value)) {
      return defaultLimit;
    }
    const normalized = Math.floor(value);
    if (normalized < minLimit) {
      return minLimit;
    }
    if (normalized > maxLimit) {
      return maxLimit;
    }
    return normalized;
  };

  const emitLog = (
    filters: TFilters,
    payload: Omit<SearchLogPayload<TFilters>, 'filters' | 'filterDescription'>
  ) => {
    if (!logger) {
      return;
    }
    const filterDescription = spec.describeFilters?.(filters);
    logger({
      ...payload,
      filters,
      filterDescription,
    });
  };

  async function search(input: TInput): Promise<Scored<TResult>[]> {
    const filters = spec.normalizeInput(input);
    const requestedLimit = getLimit?.(input) ?? undefined;
    const limit = clampLimit(requestedLimit ?? defaultLimit);

    const hasStructuredFilters = spec.hasStructuredFilters(filters);
    const recordMatchesFilters = (record: TRecord) =>
      !hasStructuredFilters || spec.recordMatches(record, filters);

    const structuredMatches = records.filter(recordMatchesFilters);
    const candidateMap = new Map<string, TRecord>();
    for (const record of structuredMatches) {
      candidateMap.set(spec.getId(record), record);
    }

    const combinedTextQuery = spec.buildCombinedTextQuery(filters).trim();
    const textMatches: SearchIndexEntry<TRecord>[] =
      combinedTextQuery && searchIndex ? await searchIndex(combinedTextQuery) : [];
    const textMatchCount = textMatches.length;
    const textScoreMap = new Map<string, number>();
    textMatches.forEach(({ record, score }, index) => {
      const resolvedRecord = resolveRecord(record);
      const id = spec.getId(resolvedRecord);
      const tieBreaker = textMatches.length ? (textMatches.length - index) * 0.01 : 0;
      textScoreMap.set(id, score + tieBreaker);
    });

    const needsCandidateExpansion = hasStructuredFilters && candidateMap.size < limit;

    const semanticQuery = spec.buildSemanticQuery(input, filters).trim();
    let semanticScoreMap = new Map<string, number>();
    if (semanticRanker && semanticQuery) {
      const targets = needsCandidateExpansion ? records : structuredMatches;
      if (targets.length) {
        semanticScoreMap = await semanticRanker(targets, semanticQuery);
      }
    }

    if (needsCandidateExpansion) {
      const maxExpanded = Math.max(limit * 3, 10);
      for (const { record } of textMatches) {
        const resolvedRecord = resolveRecord(record);
        if (!spec.recordMatches(resolvedRecord, filters)) {
          continue;
        }
        const id = spec.getId(resolvedRecord);
        if (!candidateMap.has(id)) {
          candidateMap.set(id, resolvedRecord);
        }
        if (candidateMap.size >= maxExpanded) {
          break;
        }
      }

      if (semanticScoreMap.size > 0) {
        const rankedBySemantic = Array.from(semanticScoreMap.entries()).sort((a, b) => b[1] - a[1]);
        for (const [recordId] of rankedBySemantic) {
          const record = recordById.get(recordId);
          if (!record) {
            continue;
          }
          if (!spec.recordMatches(record, filters)) {
            continue;
          }
          if (!candidateMap.has(recordId)) {
            candidateMap.set(recordId, record);
          }
          if (candidateMap.size >= maxExpanded) {
            break;
          }
        }
      }
    }

    const candidateRecords = Array.from(candidateMap.values());
    if (!candidateRecords.length) {
      emitLog(filters, {
        limit,
        structuredCandidates: structuredMatches.length,
        matchedCount: 0,
        expandedCandidates: candidateRecords.length,
        usedSemantic: semanticScoreMap.size > 0,
        rawTextMatches: textMatchCount,
        candidateCount: candidateRecords.length,
        scoredCandidates: 0,
      });
      return [];
    }

    const queryContext: SearchContext<TFilters> = {
      filters,
      hasStructuredFilters,
      combinedTextQuery,
      textScoreMap,
      semanticScoreMap,
    };

    const hasQueryTerms =
      spec.hasQueryTerms?.(filters, queryContext) ?? (hasStructuredFilters || Boolean(combinedTextQuery));
    const requireSignals =
      Boolean(combinedTextQuery) &&
      (textScoreMap.size > 0 || semanticScoreMap.size > 0 || hasStructuredFilters);

    const now = getNow();
    const recencyAccessor = spec.getRecencyTimestamp;
    const recencyLambda = typeof spec.recencyLambda === 'number' ? spec.recencyLambda : DEFAULT_RECENCY_LAMBDA;
    const recencyEnabled = typeof recencyAccessor === 'function' && recencyLambda > 0;
    let freshestTimestamp: number | null = null;
    let topRecencyContribution = 0;

    const scoredAll = candidateRecords
      .map((record) => {
        const id = spec.getId(record);
        const structuredScore = spec.computeStructuredScore(record, filters);
        const textScore = textScoreMap.get(id) ?? 0;
        const semanticScore = semanticScoreMap.get(id) ?? 0;
        const order = recordOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
        let recencyContribution = 0;
        let recencyTimestamp: number | null = null;
        if (recencyEnabled && recencyAccessor) {
          const timestamp = recencyAccessor(record, { now });
          recencyTimestamp = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
          const recencyScore = computeRecencyScore(recencyTimestamp, now);
          recencyContribution = recencyScore * recencyLambda;
          if (recencyTimestamp !== null) {
            if (freshestTimestamp === null || recencyTimestamp > freshestTimestamp) {
              freshestTimestamp = recencyTimestamp;
            }
          }
          if (recencyContribution > topRecencyContribution) {
            topRecencyContribution = recencyContribution;
          }
        }
        const weightedTextScore = textScore * TEXT_SCORE_WEIGHT;
        const weightedSemanticScore = semanticScore * SEMANTIC_SCORE_WEIGHT;
        const baseScore = structuredScore + weightedTextScore + weightedSemanticScore;
        const sortScore = baseScore + recencyContribution;
        return {
          record,
          baseScore,
          structuredScore,
          textScore: weightedTextScore,
          semanticScore: weightedSemanticScore,
          recencyContribution,
          sortScore,
          order,
        };
      })
      .filter((entry) => {
        if (!hasQueryTerms) {
          return true;
        }
        if (!requireSignals) {
          return entry.structuredScore > 0 || entry.textScore > 0 || entry.semanticScore > 0;
        }
        if (entry.structuredScore > 0) {
          return true;
        }
        return entry.textScore > 0 || entry.semanticScore > 0;
      })
      .sort((a, b) => {
        if (b.sortScore !== a.sortScore) {
          return b.sortScore - a.sortScore;
        }
        if (b.baseScore !== a.baseScore) {
          return b.baseScore - a.baseScore;
        }
        return a.order - b.order;
      });

    const scored = scoredAll.slice(0, limit);

    const results = scored.map(({ record, baseScore, structuredScore, textScore, semanticScore, recencyContribution }) => {
      const baseResult = spec.buildResult(record);
      const metadata: ScoreMetadata = {
        _score: baseScore,
        _signals: {
          structured: structuredScore || undefined,
          text: textScore || undefined,
          semantic: semanticScore || undefined,
          recency: recencyContribution || undefined,
        },
      };
      return { ...baseResult, ...metadata } as Scored<TResult>;
    });

    emitLog(filters, {
      limit,
      structuredCandidates: structuredMatches.length,
      matchedCount: results.length,
      expandedCandidates: candidateRecords.length,
      usedSemantic: semanticScoreMap.size > 0,
      topScore: scoredAll.length ? scoredAll[0]?.baseScore ?? 0 : 0,
      recencyLambda: recencyEnabled ? recencyLambda : undefined,
      freshestTimestamp: recencyEnabled ? freshestTimestamp : undefined,
      topRecencyScore: recencyEnabled ? topRecencyContribution : undefined,
      rawTextMatches: textMatchCount,
      candidateCount: candidateRecords.length,
      scoredCandidates: scoredAll.length,
    });

    return results;
  }

  return { search };
}
