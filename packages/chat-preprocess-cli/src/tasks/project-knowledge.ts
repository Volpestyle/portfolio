import OpenAI from 'openai';
import { fetchPortfolioRepos, fetchRepoReadme } from '@portfolio/github-data';
import type { RepoData } from '@portfolio/chat-contract';
import type { EmbeddingEntry, ProjectRecord } from '@portfolio/chat-data';
import { requireEnv } from '../env';
import type { PreprocessMetrics } from '../metrics';
import type { PreprocessContext, PreprocessTaskResult, RepoMatcher, ResolvedRepoSelection } from '../types';

type RepoFacts = {
  languages: string[];
  frameworks: string[];
  platforms: string[];
  domains: string[];
  tooling: string[];
  notableFeatures: string[];
  aliases: string[];
};

type ProjectNarrative = {
  oneLiner: string;
  description: string;
  bullets: string[];
  techStack: string[];
  tags: string[];
  context: ProjectRecord['context'];
  impactSummary?: string;
  sizeOrScope?: string;
};

type ProjectContextCandidate = Partial<ProjectRecord['context']> & {
  timeframe?: { start?: string; end?: string };
};

const MAX_README_CHARS = 8000;
const LOG_PREFIX = '[project-knowledge]';
const CONTEXT_TYPES = new Set<ProjectRecord['context']['type']>(['personal', 'work', 'oss', 'academic', 'other']);

const EMPTY_FACTS: RepoFacts = {
  languages: [],
  frameworks: [],
  platforms: [],
  domains: [],
  tooling: [],
  notableFeatures: [],
  aliases: [],
};

function repoMatches(repo: RepoData, matcher: RepoMatcher): boolean {
  const repoName = repo.name?.toLowerCase() ?? '';
  if (!repoName || !matcher.name) {
    return false;
  }
  if (matcher.owner) {
    const owner = repo.owner?.login?.toLowerCase() ?? '';
    return owner === matcher.owner && repoName === matcher.name;
  }
  return repoName === matcher.name;
}

function filterReposBySelection(repos: RepoData[], selection: ResolvedRepoSelection): RepoData[] {
  return repos.filter((repo) => {
    if (selection.exclude.some((matcher) => repoMatches(repo, matcher))) {
      return false;
    }
    if (selection.include.length) {
      return selection.include.some((matcher) => repoMatches(repo, matcher));
    }
    return true;
  });
}

function truncateReadme(content: string): string {
  if (content.length <= MAX_README_CHARS) {
    return content;
  }
  return `${content.slice(0, MAX_README_CHARS)}\n\n[...truncated for summarization...]`;
}

function sanitizeText(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function withRetries<T>(fn: () => Promise<T>, attempts = 3, delayMs = 250): Promise<T> {
  let lastError: unknown;
  for (let idx = 0; idx < attempts; idx += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (idx < attempts - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Unknown failure'));
}

async function runJsonSchemaCompletion<T>(params: {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userContent: string;
  metrics?: PreprocessMetrics;
  stage?: string;
  meta?: Record<string, unknown>;
}): Promise<T> {
  const { client, model, systemPrompt, userContent, metrics, stage, meta } = params;
  // response_format json_object requires that at least one message mention "json"
  const systemPromptWithJsonHint = `${systemPrompt}\n\nReturn a JSON object (json only).`;
  const completion = await withRetries(() =>
    metrics
      ? metrics.wrapLlm(
          { stage: stage ?? 'project_json', model, meta },
          () =>
            client.chat.completions.create({
              model,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemPromptWithJsonHint },
                { role: 'user', content: userContent },
              ],
            })
        )
      : client.chat.completions.create({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPromptWithJsonHint },
            { role: 'user', content: userContent },
          ],
        })
  );
  const raw = completion.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw) as T;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => Boolean(item));
}

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

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized || 'project';
}

function createSlugGenerator() {
  const slugCounts = new Map<string, number>();
  return (name: string): string => {
    const base = slugify(name);
    const current = slugCounts.get(base) ?? 0;
    slugCounts.set(base, current + 1);
    if (current === 0) {
      return base;
    }
    return `${base}-${current + 1}`;
  };
}

function maybeUrl(value?: string | null): string | undefined {
  if (!value || typeof value !== 'string') {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    return undefined;
  }
}

function buildGithubUrl(repo: RepoData): string | undefined {
  const direct = maybeUrl(repo.html_url);
  if (direct) {
    return direct;
  }
  const owner = repo.owner?.login;
  if (!owner) {
    return undefined;
  }
  return maybeUrl(`https://github.com/${owner}/${repo.name}`);
}

function buildLanguageList(repo: RepoData, facts: RepoFacts): string[] {
  if (repo.languagePercentages?.length) {
    return dedupeStrings(repo.languagePercentages.map((entry) => entry.name));
  }
  if (repo.languagesBreakdown) {
    return dedupeStrings(Object.keys(repo.languagesBreakdown));
  }
  return dedupeStrings(facts.languages);
}

function buildFallbackBullets(repo: RepoData, facts: RepoFacts): string[] {
  const bullets: string[] = [];
  if (repo.description) {
    bullets.push(repo.description);
  }
  bullets.push(...facts.notableFeatures);
  if (facts.frameworks.length) {
    bullets.push(`Stack highlights: ${facts.frameworks.slice(0, 3).join(', ')}`);
  }
  if (facts.domains.length) {
    bullets.push(`Focus areas: ${facts.domains.slice(0, 3).join(', ')}`);
  }
  return dedupeStrings(bullets).slice(0, 5);
}

function ensureBullets(values: string[], fallback: string[]): string[] {
  const normalized = dedupeStrings(values);
  if (normalized.length >= 3) {
    return normalized.slice(0, 5);
  }
  if (normalized.length > 0) {
    const supplemented = normalized.concat(fallback).slice(0, 5);
    return supplemented.length >= 3 ? supplemented : supplemented.concat(fallback).slice(0, 3);
  }
  const ensured = fallback.length ? fallback : ['Key responsibilities unavailable.'];
  return ensured.slice(0, 5);
}

function normalizeReadmeContent(readme: string, fallback: string): string {
  const normalized = readme.trim();
  if (normalized) {
    return normalized;
  }
  const fallbackText = fallback.trim();
  return fallbackText || 'Documentation unavailable.';
}

function toDateOnly(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString().slice(0, 10);
}

function buildRepoTimeframe(repo: RepoData): { start?: string; end?: string } | undefined {
  const start = toDateOnly(sanitizeText(repo.created_at));
  const end = toDateOnly(sanitizeText(repo.pushed_at ?? repo.updated_at));
  if (!start && !end) {
    return undefined;
  }
  return {
    start: start || undefined,
    end: end || undefined,
  };
}

function normalizeContext(input: ProjectContextCandidate | undefined, repo: RepoData): ProjectRecord['context'] {
  const repoName = repo.name.toLowerCase();
  const repoDesc = repo.description?.toLowerCase() ?? '';
  let type = input?.type && CONTEXT_TYPES.has(input.type) ? input.type : undefined;

  if (!type) {
    if (repoName.includes('intern') || repoDesc.includes('internship')) {
      type = 'work';
    } else if (repoName.includes('npr') || repoDesc.includes('npr')) {
      type = 'work';
    } else {
      type = 'personal';
    }
  }

  const organization = sanitizeText(input?.organization);
  const role = sanitizeText(input?.role);
  const timeframeInput = input?.timeframe ?? {};
  const timeframeCandidate = {
    start: toDateOnly(sanitizeText(timeframeInput?.start) || ''),
    end: toDateOnly(sanitizeText(timeframeInput?.end) || ''),
  };
  const repoTimeframe = buildRepoTimeframe(repo);
  let timeframe =
    timeframeCandidate.start || timeframeCandidate.end
      ? {
        start: timeframeCandidate.start || repoTimeframe?.start,
        end: timeframeCandidate.end || repoTimeframe?.end,
      }
      : repoTimeframe;

  const today = toDateOnly(new Date().toISOString());
  if (timeframe?.end && today && timeframe.end > today) {
    timeframe = { ...timeframe, end: today };
  }
  if (timeframe?.start && today && timeframe.start > today) {
    timeframe = { ...timeframe, start: today };
  }

  return {
    type,
    organization: organization || undefined,
    role: role || undefined,
    timeframe,
  };
}

async function generateRepoFacts(
  client: OpenAI,
  repo: RepoData,
  readme: string,
  model: string,
  metrics?: PreprocessMetrics
): Promise<RepoFacts> {
  try {
    const parsed = await runJsonSchemaCompletion<Partial<RepoFacts>>({
      client,
      model,
      systemPrompt:
        "Extract every explicit technology reference from the repo README. Capture frameworks, runtimes, domains, tooling, and notable features. DO NOT extract programming languages as they come from GitHub's deterministic language detection. Include common acronyms or aliases so downstream filters can match multiple phrasings. Return empty arrays when information is missing.",
      userContent: `Repository: ${repo.name}\nDescription: ${repo.description ?? 'n/a'}\n\nREADME:\n${truncateReadme(
        readme
      )}`,
      metrics,
      stage: 'project_enrichment',
      meta: { repo: repo.name },
    });
    return coerceRepoFacts(parsed);
  } catch (error) {
    console.warn(`Failed to extract facts for ${repo.name}.`, error);
    return EMPTY_FACTS;
  }
}

async function generateProjectNarrative(
  client: OpenAI,
  repo: RepoData,
  readme: string,
  facts: RepoFacts,
  model: string,
  metrics?: PreprocessMetrics
): Promise<ProjectNarrative> {
  const fallbackOneLiner = repo.description?.trim() || `${repo.name} project`;
  const fallbackBullets = buildFallbackBullets(repo, facts);
  const fallbackNarrative: ProjectNarrative = {
    oneLiner: fallbackOneLiner,
    description: fallbackOneLiner,
    bullets: ensureBullets([], fallbackBullets),
    techStack: dedupeStrings([...facts.frameworks, ...facts.platforms, ...facts.tooling]),
    tags: dedupeStrings([...facts.domains, ...facts.aliases]),
    context: normalizeContext(undefined, repo),
    impactSummary: undefined,
    sizeOrScope: undefined,
  };

  try {
    const parsed = await runJsonSchemaCompletion<{
      oneLiner?: string;
      description?: string;
      bullets?: string[];
      techStack?: string[];
      tags?: string[];
      context?: ProjectContextCandidate;
      impactSummary?: string;
      sizeOrScope?: string;
    }>({
      client,
      model,
      systemPrompt:
        'You are a meticulous summarizer creating structured project descriptions for a developer\'s portfolio. Produce a snappy one-liner (1-2 sentences) plus a richer description (2-4 sentences) grounded strictly in the provided facts/README. Make sure bullets are concrete contributions or results. When context is not explicit, infer conservatively (e.g., personal side project). Include impactSummary (1 sentence) and sizeOrScope (team size, users, scale) when possible.',
      userContent: `Repository: ${repo.name}
Description: ${repo.description ?? 'n/a'}

Extracted facts:
${formatFactsForPrompt(facts)}

README:
${truncateReadme(readme)}`,
      metrics,
      stage: 'project_enrichment',
      meta: { repo: repo.name },
    });

    const oneLiner = sanitizeText(parsed.oneLiner) || fallbackNarrative.oneLiner;
    const description = sanitizeText(parsed.description) || oneLiner;
    const bullets = ensureBullets(normalizeStringArray(parsed.bullets), fallbackBullets);
    const techStackCandidate = dedupeStrings([
      ...normalizeStringArray(parsed.techStack),
      ...facts.frameworks,
      ...facts.platforms,
      ...facts.tooling,
    ]);
    const tags = dedupeStrings([...normalizeStringArray(parsed.tags), ...facts.domains, ...facts.aliases]);
    const techStack =
      techStackCandidate.length > 0
        ? techStackCandidate
        : dedupeStrings([...facts.languages, ...facts.frameworks, ...facts.tooling]);

    return {
      oneLiner,
      description,
      bullets,
      techStack,
      tags,
      context: normalizeContext(parsed.context, repo),
      impactSummary: sanitizeText(parsed.impactSummary) || undefined,
      sizeOrScope: sanitizeText(parsed.sizeOrScope) || undefined,
    };
  } catch (error) {
    console.warn(`Failed to build narrative for ${repo.name}. Falling back to repo description.`, error);
    return fallbackNarrative;
  }
}

async function buildEmbedding(
  client: OpenAI,
  repoName: string,
  project: ProjectNarrative,
  facts: RepoFacts,
  languages: string[],
  model: string,
  metrics?: PreprocessMetrics
): Promise<number[]> {
  const embeddingPayload = [
    project.oneLiner,
    project.description,
    project.impactSummary ? `Impact: ${project.impactSummary}` : '',
    project.sizeOrScope ? `Size/Scope: ${project.sizeOrScope}` : '',
    `Bullets: ${project.bullets.join(' • ')}`,
    `Stack: ${project.techStack.join(', ')}`,
    `Tags: ${project.tags.join(', ')}`,
    languages.length ? `Languages: ${languages.join(', ')}` : '',
    project.context.organization ? `Organization: ${project.context.organization}` : '',
    formatFactsForEmbedding(facts),
  ]
    .filter(Boolean)
    .join('\n');

  const response = await (metrics
    ? metrics.wrapLlm(
        { stage: 'project_enrichment', model, meta: { repo: repoName } },
        () =>
          client.embeddings.create({
            model,
            input: `${repoName}\n${embeddingPayload}`,
          })
      )
    : client.embeddings.create({
        model,
        input: `${repoName}\n${embeddingPayload}`,
      }));
  return response.data[0]?.embedding ?? [];
}

export async function runProjectKnowledgeTask(context: PreprocessContext): Promise<PreprocessTaskResult> {
  requireEnv('GH_TOKEN');
  requireEnv('PORTFOLIO_GIST_ID');
  const openAiKey = requireEnv('OPENAI_API_KEY');
  const { projectsOutput, projectsEmbeddingsOutput } = context.paths;
  const repoSelection = context.repoSelection;

  const client = new OpenAI({ apiKey: openAiKey });
  const { projectTextModel, projectEmbeddingModel } = context.models;
  const { starred, normal } = await fetchPortfolioRepos({
    gistId: repoSelection.gistId || process.env.PORTFOLIO_GIST_ID || '',
  });
  const repos = filterReposBySelection([...starred, ...normal], repoSelection);

  if (!repos.length) {
    const buildId = new Date().toISOString();
    const dataset = { generatedAt: buildId, projects: [] as ProjectRecord[] };
    const emptyEmbeddings = {
      meta: { schemaVersion: 1, buildId },
      entries: [] as EmbeddingEntry[],
    };
    const [projectsArtifact, embeddingsArtifact] = await Promise.all([
      context.artifacts.writeJson({ id: 'projects', filePath: projectsOutput, data: dataset }),
      context.artifacts.writeJson({ id: 'projects-embeddings', filePath: projectsEmbeddingsOutput, data: emptyEmbeddings }),
    ]);
    return {
      description: 'No repositories found in portfolio config.',
      counts: [{ label: 'Repos', value: 0 }],
      artifacts: [
        { path: projectsArtifact.relativePath, note: '0 records' },
        { path: embeddingsArtifact.relativePath, note: '0 records' },
      ],
    };
  }

  const slugger = createSlugGenerator();
  const projects: ProjectRecord[] = [];
  const embeddings: EmbeddingEntry[] = [];

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

      const slug = slugger(repo.name);
      const owner = repo.owner?.login;
      if (!owner) {
        console.warn(`${LOG_PREFIX} [worker-${workerId}] Skipping ${repo.name} because owner login is missing.`);
        continue;
      }

      console.log(`${LOG_PREFIX} [worker-${workerId}] ${repo.name}`);
      let readme: string;
      try {
        readme = await fetchRepoReadme({ repo: repo.name, owner });
      } catch (error) {
        console.warn(`${LOG_PREFIX} Falling back to description-only summary for ${repo.name}:`, error);
        readme = repo.description ?? 'No README or description available.';
      }

      const facts = await generateRepoFacts(client, repo, readme, projectTextModel, context.metrics);
      const narrative = await generateProjectNarrative(client, repo, readme, facts, projectTextModel, context.metrics);
      const readmeText = normalizeReadmeContent(readme, narrative.description || narrative.oneLiner);

      const languages = buildLanguageList(repo, facts);
      const tags = dedupeStrings([...narrative.tags, ...facts.tooling, ...facts.domains, ...facts.aliases]);
      const project: ProjectRecord = {
        id: slug,
        slug,
        name: repo.name,
        githubUrl: buildGithubUrl(repo),
        liveUrl: maybeUrl(repo.homepage),
        oneLiner: narrative.oneLiner,
        description: narrative.description,
        bullets: narrative.bullets,
        impactSummary: narrative.impactSummary,
        sizeOrScope: narrative.sizeOrScope,
        techStack: narrative.techStack,
        languages,
      tags,
      context: narrative.context,
      contextType: narrative.context.type,
      readme: readmeText,
      embeddingId: slug,
    };

      projects.push(project);

      const embedding = await buildEmbedding(client, repo.name, narrative, facts, languages, projectEmbeddingModel, context.metrics);
      embeddings.push({ id: slug, vector: embedding });
    }
  }

  await Promise.all(Array.from({ length: workerCount }, (_, workerId) => worker(workerId + 1)));

  const buildId = new Date().toISOString();
  const dataset = {
    generatedAt: buildId,
    projects: projects.sort((a, b) => a.name.localeCompare(b.name)),
  };

  const sortedEmbeddings = embeddings.sort((a, b) => a.id.localeCompare(b.id));
  const embeddingIndex = {
    meta: {
      schemaVersion: 1,
      buildId,
    },
    entries: sortedEmbeddings,
  };

  const [projectsArtifact, embeddingsArtifact] = await Promise.all([
    context.artifacts.writeJson({ id: 'projects', filePath: projectsOutput, data: dataset }),
    context.artifacts.writeJson({
      id: 'projects-embeddings',
      filePath: projectsEmbeddingsOutput,
      data: embeddingIndex,
    }),
  ]);

  return {
    description: `Generated ${projects.length} project records with embeddings`,
    counts: [
      { label: 'Repos', value: repos.length },
      { label: 'Projects', value: projects.length },
      { label: 'Embeddings', value: embeddings.length },
    ],
    artifacts: [
      { path: projectsArtifact.relativePath, note: `${projects.length} records` },
      { path: embeddingsArtifact.relativePath, note: `${embeddings.length} vectors` },
    ],
  };
}
