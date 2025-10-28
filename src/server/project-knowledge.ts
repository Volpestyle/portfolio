import OpenAI from 'openai';
import type { RepoData } from '@/lib/github-server';
import { resolveSecretValue } from '@/lib/secrets/manager';
import repoSummaries from '../../generated/repo-summaries.json';
import repoEmbeddings from '../../generated/repo-embeddings.json';

type RepoSummaryRecord = {
  name: string;
  summary: string;
  tags?: string[];
};

type KnowledgeRecord = {
  name: string;
  summary: string;
  tags: string[];
  searchableText: string;
};

type RepoEmbeddingRecord = {
  name: string;
  embedding: number[];
};

const summaryRecords: RepoSummaryRecord[] = repoSummaries as RepoSummaryRecord[];
const embeddingRecords: RepoEmbeddingRecord[] = repoEmbeddings as RepoEmbeddingRecord[];
let cachedOpenAI: OpenAI | undefined;

async function getOpenAI(): Promise<OpenAI> {
  if (!cachedOpenAI) {
    const apiKey = await resolveSecretValue('OPENAI_API_KEY', { scope: 'repo', required: true });
    cachedOpenAI = new OpenAI({ apiKey });
  }
  return cachedOpenAI;
}

function normalizeTags(rawTags?: string[]): string[] {
  const normalized = new Set<string>();
  for (const tag of rawTags ?? []) {
    if (!tag) {
      continue;
    }
    const cleaned = tag
      .replace(/["`]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\\/g, ' ')
      .trim();
    if (!cleaned) {
      continue;
    }
    cleaned
      .split(/\s*\|\s*|\s*,\s*/)
      .map((piece) => piece.trim())
      .filter(Boolean)
      .forEach((piece) => normalized.add(piece));
  }
  return Array.from(normalized);
}

const knowledgeRecords: KnowledgeRecord[] = summaryRecords.map((record) => {
  const tags = normalizeTags(record.tags);
  const searchableText = `${record.summary ?? ''} ${tags.join(' ')}`.toLowerCase();
  return {
    name: record.name,
    summary: record.summary,
    tags,
    searchableText,
  };
});

const summaryMap = new Map(knowledgeRecords.map((record) => [record.name.toLowerCase(), record]));

function getSummaryRecord(name: string) {
  return summaryMap.get(name.toLowerCase());
}

export function getKnowledgeRecords() {
  return knowledgeRecords;
}

export function normalizeSearchTerm(value: string) {
  return value.toLowerCase().trim();
}

export function scoreKnowledgeRecord(record: KnowledgeRecord, terms: string[]): number {
  if (!terms.length) {
    return 0;
  }
  return terms.reduce((score, term) => (record.searchableText.includes(term) ? score + 1 : score), 0);
}

export function augmentRepoWithKnowledge<T extends RepoData>(repo: T): T {
  const knowledge = getSummaryRecord(repo.name);
  if (!knowledge) {
    return repo;
  }

  return {
    ...repo,
    summary: knowledge.summary,
    tags: knowledge.tags,
  } as T;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length) {
    return -1;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const va = a[i]!;
    const vb = b[i]!;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

export async function searchRepoKnowledge(query: string, limit: number = 5) {
  if (!query?.trim() || !embeddingRecords.length) {
    return [] as Array<{ name: string; summary?: string; tags?: string[]; score: number }>;
  }

  let client: OpenAI;
  try {
    client = await getOpenAI();
  } catch (error) {
    console.error('[ProjectKnowledge] Missing OPENAI_API_KEY secret', error);
    return [];
  }

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });

  const queryVector = response.data[0]?.embedding;
  if (!queryVector) {
    return [];
  }

  const scored = embeddingRecords
    .map((record) => {
      const summary = getSummaryRecord(record.name);
      const score = cosineSimilarity(queryVector, record.embedding);
      return {
        name: record.name,
        summary: summary?.summary,
        tags: summary?.tags,
        score,
      };
    })
    .filter((item) => item.summary)
    .sort((a, b) => b.score - a.score);

  const limited = scored.slice(0, limit);
  return limited.filter((item) => typeof item.summary === 'string');
}
