#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { fetchPortfolioRepos, fetchRepoReadme, type RepoData } from '@/lib/github-server';

type SummaryRecord = {
  name: string;
  summary: string;
  tags: string[];
  languages?: Array<{ name: string; percent: number }>;
};

type EmbeddingRecord = {
  name: string;
  embedding: number[];
};

type RepoFacts = {
  languages: string[];
  frameworks: string[];
  platforms: string[];
  domains: string[];
  tooling: string[];
  notableFeatures: string[];
  aliases: string[];
};

const OUTPUT_DIR = path.resolve(process.cwd(), 'generated');
const SUMMARY_PATH = path.join(OUTPUT_DIR, 'repo-summaries.json');
const EMBEDDING_PATH = path.join(OUTPUT_DIR, 'repo-embeddings.json');
const MAX_README_CHARS = 8000;
const ENV_FILES = ['.env.local', '.env'];

function loadEnvFiles() {
  for (const fileName of ENV_FILES) {
    const fullPath = path.resolve(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const contents = fs.readFileSync(fullPath, 'utf-8');
    for (const line of contents.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) {
        continue;
      }
      const [rawKey, ...rest] = line.split('=');
      if (!rawKey || rest.length === 0) {
        continue;
      }
      const key = rawKey.trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }
      const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    }
  }
}

function requireEnv(key: string, errorMessage?: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(errorMessage ?? `${key} is required`);
  }
  return value;
}

function truncateReadme(content: string): string {
  if (content.length <= MAX_README_CHARS) {
    return content;
  }
  return `${content.slice(0, MAX_README_CHARS)}\n\n[...truncated for summarization...]`;
}

function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  if (start === -1) {
    return raw;
  }
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i]!;
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return raw.slice(start);
}

function extractTextFromResponse(response: OpenAI.Responses.Response): string {
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type === 'message' && 'content' in item) {
      for (const content of item.content ?? []) {
        if (content.type === 'output_text') {
          chunks.push(content.text);
        }
      }
    }
  }
  return chunks.join('\n').trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => Boolean(item));
}

const EMPTY_FACTS: RepoFacts = {
  languages: [],
  frameworks: [],
  platforms: [],
  domains: [],
  tooling: [],
  notableFeatures: [],
  aliases: [],
};

function coerceRepoFacts(raw: Partial<RepoFacts> | undefined): RepoFacts {
  return {
    languages: normalizeStringArray(raw?.languages),
    frameworks: normalizeStringArray(raw?.frameworks),
    platforms: normalizeStringArray(raw?.platforms),
    domains: normalizeStringArray(raw?.domains),
    tooling: normalizeStringArray(raw?.tooling),
    notableFeatures: normalizeStringArray(raw?.notableFeatures),
    aliases: normalizeStringArray(raw?.aliases),
  };
}

function formatFactsForPrompt(facts: RepoFacts): string {
  return [
    `Languages: ${facts.languages.join(', ') || 'n/a'}`,
    `Frameworks/Libraries: ${facts.frameworks.join(', ') || 'n/a'}`,
    `Platforms/Runtimes: ${facts.platforms.join(', ') || 'n/a'}`,
    `Domains: ${facts.domains.join(', ') || 'n/a'}`,
    `Tooling/Infrastructure: ${facts.tooling.join(', ') || 'n/a'}`,
    `Notable Features: ${facts.notableFeatures.join(', ') || 'n/a'}`,
    `Aliases & Synonyms: ${facts.aliases.join(', ') || 'n/a'}`,
  ].join('\n');
}

function formatFactsForEmbedding(facts: RepoFacts): string {
  return [
    facts.languages.length ? `Languages: ${facts.languages.join(', ')}` : '',
    facts.frameworks.length ? `Frameworks: ${facts.frameworks.join(', ')}` : '',
    facts.platforms.length ? `Platforms: ${facts.platforms.join(', ')}` : '',
    facts.domains.length ? `Domains: ${facts.domains.join(', ')}` : '',
    facts.tooling.length ? `Tooling: ${facts.tooling.join(', ')}` : '',
    facts.notableFeatures.length ? `Features: ${facts.notableFeatures.join(', ')}` : '',
    facts.aliases.length ? `Aliases: ${facts.aliases.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function generateRepoFacts(
  client: OpenAI,
  repo: RepoData,
  readme: string
): Promise<RepoFacts> {
  try {
    const response = await client.responses.create({
      model: 'gpt-5-nano-2025-08-07',
      text: {
        format: {
          type: 'json_schema',
          name: 'RepoFacts',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'languages',
              'frameworks',
              'platforms',
              'domains',
              'tooling',
              'notableFeatures',
              'aliases',
            ],
            properties: {
              languages: {
                type: 'array',
                items: { type: 'string' },
                description: 'Programming languages explicitly mentioned.',
              },
              frameworks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Frameworks, libraries, UI kits, or engines.',
              },
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description: 'Runtimes, platforms, or deployment targets (e.g., iOS, AWS Lambda).',
              },
              domains: {
                type: 'array',
                items: { type: 'string' },
                description: 'Problem domains or solution areas (e.g., AI, DevTools, Fintech).',
              },
              tooling: {
                type: 'array',
                items: { type: 'string' },
                description: 'Supporting infrastructure, databases, CI/CD, or notable services.',
              },
              notableFeatures: {
                type: 'array',
                items: { type: 'string' },
                description: 'Distinctive capabilities or differentiators.',
              },
              aliases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Nicknames, acronyms, or stack aliases (e.g., MEAN, JAMstack).',
              },
            },
          },
        },
      },
      input: [
        {
          role: 'system',
          content:
            'Extract every explicit technology reference from the repo README. Capture frameworks, runtimes, domains, tooling, and notable features. DO NOT extract programming languages as they come from GitHub\'s deterministic language detection. Include common acronyms or aliases so downstream filters can match multiple phrasings. Return empty arrays when information is missing.',
        },
        {
          role: 'user',
          content: `Repository: ${repo.name}\nDescription: ${repo.description ?? 'n/a'
            }\n\nREADME:\n${truncateReadme(readme)}`,
        },
      ],
    });

    const raw = extractTextFromResponse(response);
    const cleanJson = extractFirstJsonObject(raw);
    const parsed = JSON.parse(cleanJson) as Partial<RepoFacts>;
    return coerceRepoFacts(parsed);
  } catch (error) {
    console.warn(`Failed to extract facts for ${repo.name}.`, error);
    return EMPTY_FACTS;
  }
}

async function summarizeRepo(
  client: OpenAI,
  repo: RepoData,
  readme: string,
  facts: RepoFacts
): Promise<{ summary: string; tags: string[] }> {
  // Derive technical tags from structured facts (excluding languages since we get those from GitHub)
  const derivedTags = [
    ...facts.frameworks,
    ...facts.platforms,
    ...facts.tooling,
    ...facts.domains.slice(0, 3), // limit domains to avoid bloat
    ...facts.aliases.slice(0, 2), // include a few key aliases
  ].filter(Boolean);

  const response = await client.responses.create({
    model: 'gpt-5-nano-2025-08-07',
    text: {
      format: {
        type: 'json_schema',
        name: 'RepoSummary',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'tags'],
          properties: {
            summary: {
              type: 'string',
              description:
                'Two concise sentences describing the project, key technologies (languages, frameworks, platforms), and real impact.',
            },
            tags: {
              type: 'array',
              description:
                'Additional technical keywords not captured in the structured facts: specialized tools, specific versions, architectural patterns, or domain-specific terms. Only include concrete technical terms.',
              minItems: 0,
              maxItems: 6,
              items: { type: 'string' },
            },
          },
        },
      },
    },
    input: [
      {
        role: 'system',
        content:
          'You write short, factual repo summaries grounded in provided facts. Mention frameworks, runtimes, and domains whenever possible. For tags, only add technical keywords that are NOT already captured in the structured facts (frameworks, platforms, tooling, domains). Focus on specific tools, versions, or architectural patterns that add value. DO NOT include programming languages in tags as they are detected separately by GitHub.',
      },
      {
        role: 'user',
        content: `Repository: ${repo.name}\nDescription: ${repo.description ?? 'n/a'
          }\n\nExtracted facts:\n${formatFactsForPrompt(facts)}\n\nREADME:\n${truncateReadme(readme)}`,
      },
    ],
  });

  const raw = extractTextFromResponse(response);
  try {
    const cleanJson = extractFirstJsonObject(raw);
    const parsed = JSON.parse(cleanJson);

    // Merge derived tags (priority) with AI-suggested tags
    const aiTags = Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [];
    const allTags = [...derivedTags, ...aiTags];

    // Deduplicate while preserving order (case-insensitive)
    const seen = new Set<string>();
    const uniqueTags = allTags.filter(tag => {
      const normalized = tag.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    return {
      summary: parsed.summary as string,
      tags: uniqueTags.slice(0, 12), // cap at 12 tags total
    };
  } catch (error) {
    console.warn(`Failed to parse summary for ${repo.name}. Falling back to plain text.`, error);
    return {
      summary: raw || repo.description || 'Summary unavailable.',
      tags: derivedTags.slice(0, 12),
    };
  }
}

async function buildEmbedding(client: OpenAI, repoName: string, text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: `${repoName}\n${text}`,
  });
  return response.data[0]?.embedding ?? [];
}

async function main() {
  loadEnvFiles();
  requireEnv('GH_TOKEN');
  requireEnv('PORTFOLIO_GIST_ID');
  const openAiKey = requireEnv('OPENAI_API_KEY');

  const client = new OpenAI({ apiKey: openAiKey });
  const { starred, normal } = await fetchPortfolioRepos();
  const repos = [...starred, ...normal];
  if (!repos.length) {
    console.log('No repositories found in portfolio config.');
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const summaries: SummaryRecord[] = [];
  const embeddings: EmbeddingRecord[] = [];

  const maxConcurrency = Number.parseInt(process.env.PROJECT_KNOWLEDGE_CONCURRENCY ?? '3', 10);
  const workerCount = Math.max(1, Math.min(Number.isFinite(maxConcurrency) ? maxConcurrency : 3, repos.length));
  let nextIndex = 0;

  async function worker(workerId: number) {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const repo = repos[currentIndex];
      if (!repo) {
        break;
      }

      const owner = repo.owner?.login;
      if (!owner) {
        console.warn(`Skipping ${repo.name} because owner login is missing.`);
        continue;
      }

      console.log(`[worker-${workerId}] Processing ${repo.name}...`);
      let readme: string;
      try {
        readme = await fetchRepoReadme(repo.name, owner);
      } catch (error) {
        console.warn(`[worker-${workerId}] Falling back to description-only summary for ${repo.name}:`, error);
        readme = repo.description ?? 'No README or description available.';
      }

      const facts = await generateRepoFacts(client, repo, readme);
      const summary = await summarizeRepo(client, repo, readme, facts);
      summaries.push({
        name: repo.name,
        summary: summary.summary,
        tags: summary.tags,
        languages: repo.languagePercentages,
      });

      const languagesText = repo.languagePercentages
        ? `Languages: ${repo.languagePercentages.map(l => `${l.name} ${l.percent}%`).join(', ')}`
        : '';

      const embeddingPayload = [
        summary.summary,
        `Tags: ${summary.tags.join(', ')}`,
        languagesText,
        formatFactsForEmbedding(facts),
      ]
        .filter(Boolean)
        .join('\n');
      const embedding = await buildEmbedding(client, repo.name, embeddingPayload);
      embeddings.push({ name: repo.name, embedding });
    }
  }

  await Promise.all(Array.from({ length: workerCount }, (_, workerId) => worker(workerId + 1)));

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summaries, null, 2));
  fs.writeFileSync(EMBEDDING_PATH, JSON.stringify(embeddings, null, 2));

  console.log(`Wrote ${summaries.length} summaries to ${SUMMARY_PATH}`);
  console.log(`Wrote ${embeddings.length} embeddings to ${EMBEDDING_PATH}`);
}

main().catch((error) => {
  console.error('Failed to generate project knowledge artifacts.', error);
  process.exit(1);
});
