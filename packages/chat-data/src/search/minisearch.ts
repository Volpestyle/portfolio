import MiniSearch, { type SearchResult } from 'minisearch';

type SearchableDoc = {
  id: string;
  text: string;
};

type MiniSearchIndex = MiniSearch<SearchableDoc>;

type MiniSearchOptions = {
  fuzzy?: number | boolean;
  prefix?: boolean;
  limit?: number;
};

const DEFAULT_MINISEARCH_OPTIONS: Required<Pick<MiniSearchOptions, 'fuzzy' | 'prefix' | 'limit'>> = {
  fuzzy: 0.2,
  prefix: true,
  limit: 50,
};

export function createMiniSearchIndex(docs: SearchableDoc[], options?: MiniSearchOptions): MiniSearchIndex {
  const index = new MiniSearch<SearchableDoc>({
    fields: ['text'],
    storeFields: ['id', 'text'],
    searchOptions: {
      fuzzy: options?.fuzzy ?? DEFAULT_MINISEARCH_OPTIONS.fuzzy,
      prefix: options?.prefix ?? DEFAULT_MINISEARCH_OPTIONS.prefix,
    },
  });
  index.addAll(docs);
  return index;
}

export function runMiniSearch(
  searcher: MiniSearchIndex,
  query: string,
  options?: MiniSearchOptions
): Array<{ id: string; score: number }> {
  const results: SearchResult[] = searcher.search(query, {
    fuzzy: options?.fuzzy ?? DEFAULT_MINISEARCH_OPTIONS.fuzzy,
    prefix: options?.prefix ?? DEFAULT_MINISEARCH_OPTIONS.prefix,
  });
  const limited = results.slice(0, options?.limit ?? DEFAULT_MINISEARCH_OPTIONS.limit);
  const maxScore = limited.length > 0 ? limited[0].score : 1;
  return limited.map((result) => ({
    id: result.id,
    score: maxScore > 0 ? result.score / maxScore : 0,
  }));
}
