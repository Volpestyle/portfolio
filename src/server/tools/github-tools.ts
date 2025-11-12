import OpenAI from 'openai';
import { getRepos, getRepoByName, getReadmeForRepo, getRawDoc, type RepoData } from '@/lib/github-server';
import { augmentRepoWithKnowledge, searchRepoKnowledge } from '@/server/project-knowledge';
import { resolveSecretValue } from '@/lib/secrets/manager';

type FindProjectsInput = {
  query: string;
  limit?: number;
};

type GetReadmeInput = {
  repo: string;
};

type GetDocInput = {
  repo: string;
  path: string;
};

const TOOL_LOGGING_DISABLED = process.env.CHAT_TOOL_LOGGING === '0';

let cachedOpenAI: OpenAI | undefined;

async function getOpenAI() {
  if (!cachedOpenAI) {
    const apiKey = await resolveSecretValue('OPENAI_API_KEY', { scope: 'repo', required: true });
    cachedOpenAI = new OpenAI({ apiKey });
  }
  return cachedOpenAI;
}

function logToolEvent(event: string, payload: Record<string, unknown>) {
  if (TOOL_LOGGING_DISABLED) {
    return;
  }
  console.info(`[chat-tools] ${event}`, payload);
}

const normalizeName = (input: string) => input.toLowerCase();

type Candidate = {
  name: string;
  summary: string;
  languages: string[];
  tags: string[];
};

export async function findProjects({ query, limit = 5 }: FindProjectsInput) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed) {
    throw new Error('Search query is required');
  }

  const cappedLimit = Math.max(1, Math.min(10, Math.floor(limit ?? 5)));

  // Step 1: Semantic search returns broader set of candidates
  const candidateLimit = Math.min(cappedLimit * 4, 20);
  const { matches } = await searchRepoKnowledge(trimmed, candidateLimit);

  if (!matches.length) {
    logToolEvent('findProjects.zeroResults', { query: trimmed, stage: 'semantic' });
    return [];
  }

  // Step 2: Prepare candidates for LLM filtering
  const candidates: Candidate[] = matches.map((m) => ({
    name: m.name,
    summary: m.summary || '',
    languages: (m.languages || []).map((l) => l.name),
    tags: m.tags || [],
  }));

  // Step 3: Ask LLM to filter and rank candidates
  let filteredIndices: number[];
  let fallbackReason: string | null = null;
  try {
    const client = await getOpenAI();
    const response = await client.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        {
          role: 'system',
          content: `You are a project filter. Given a user query and project candidates, return the indices (0-based) of projects that actually match the query. Return them in order of relevance (best match first).

Rules:
- Only include projects that genuinely match the query
- "Rust" should NOT match "Rubiks" (not the same thing)
- If no projects match, return an empty array
- Return ONLY a JSON array of numbers, nothing else`,
        },
        {
          role: 'user',
          content: `Query: "${trimmed}"

Candidates:
${candidates.map((c, i) => `${i}. ${c.name}: ${c.summary.slice(0, 200)} | Languages: ${c.languages.join(', ')} | Tags: ${c.tags.slice(0, 5).join(', ')}`).join('\n')}

Return JSON array of matching indices:`,
        },
      ],
      temperature: 0,
      max_tokens: 100,
    });

    const rawContent = response.choices[0]?.message?.content ?? '[]';
    const cleanedContent = rawContent
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    filteredIndices = JSON.parse(cleanedContent || '[]');

    if (!Array.isArray(filteredIndices)) {
      throw new Error('LLM did not return array');
    }
  } catch (error) {
    fallbackReason = error instanceof Error ? error.message : String(error);
    console.error('[chat-tools] LLM filtering failed, falling back to semantic only', error);
    // Fallback: use semantic results as-is
    filteredIndices = matches.slice(0, cappedLimit).map((_, i) => i);
  }

  // Step 4: Resolve filtered candidates to full repo data
  const repos = await getRepos();
  const repoMap = new Map(repos.map((repo) => [normalizeName(repo.name), augmentRepoWithKnowledge(repo)]));
  const resolved: RepoData[] = [];
  const seen = new Set<string>();

  for (const index of filteredIndices) {
    if (resolved.length >= cappedLimit) break;

    const candidate = candidates[index];
    if (!candidate) continue;

    const key = normalizeName(candidate.name);
    if (seen.has(key)) continue;

    let repo = repoMap.get(key);
    if (!repo) {
      try {
        repo = augmentRepoWithKnowledge(await getRepoByName(candidate.name));
      } catch (error) {
        console.warn('[chat-tools] findProjects missing repo data', { repo: candidate.name, error });
        continue;
      }
    }

    resolved.push(repo);
    seen.add(key);
  }

  const candidateNames = candidates.map((c) => c.name);
  const filteredNames = filteredIndices
    .map((index) => candidates[index]?.name)
    .filter((name): name is string => Boolean(name));
  const resultNames = resolved.map((repo) => repo.name);

  logToolEvent('findProjects', {
    query: trimmed,
    limit: cappedLimit,
    candidatesCount: matches.length,
    filteredCount: filteredIndices.length,
    resultsCount: resolved.length,
    candidates: candidateNames,
    filteredCandidates: filteredNames,
    resultCandidates: resultNames,
    fallbackReason,
  });

  if (!resolved.length) {
    logToolEvent('findProjects.zeroResults', {
      query: trimmed,
      candidatesTried: matches.length,
      candidateNames,
      stage: 'llm-filter',
      fallbackReason,
    });
  }

  return resolved;
}

export async function getReadme({ repo }: GetReadmeInput) {
  const repoInfo = await getRepoByName(repo);
  const owner = repoInfo.owner?.login;
  const readme = await getReadmeForRepo(repoInfo.name, owner);
  return { repo: repoInfo, readme };
}

export async function getDoc({ repo, path }: GetDocInput) {
  const data = await getRawDoc(repo, path);
  const title = path.split('/').pop() || 'Document';
  return {
    repoName: data.projectName || repo,
    path,
    title,
    content: data.content,
  };
}
