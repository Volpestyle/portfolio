import {
  getRepos,
  getRepoByName,
  getReadmeForRepo,
  getRawDoc,
  type RepoData,
} from '@/lib/github-server';
import {
  augmentRepoWithKnowledge,
  getKnowledgeRecords,
  normalizeSearchTerm,
  searchRepoKnowledge,
} from '@/server/project-knowledge';

type ProjectFilter = {
  field: 'language' | 'topic';
  value: string;
};

type ListProjectsInput = {
  filters?: ProjectFilter[];
  limit?: number;
  sort?: 'recent' | 'alphabetical' | 'starred';
};

type SearchProjectsInput = {
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

type NavigateInput = {
  section: 'about' | 'projects' | 'contact';
};

const STARRED_SCORE_BOOST = 1.1;

type NormalizedFilter = {
  field: 'language' | 'topic';
  value: string;
};

export async function listProjects({ filters, limit, sort }: ListProjectsInput = {}) {
  const cappedLimit =
    typeof limit === 'number' && Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 20) : undefined;

  const normalizedFilters: NormalizedFilter[] = Array.isArray(filters)
    ? filters
      .map((filter) => ({
        field: filter.field,
        value: normalizeSearchTerm(filter.value),
      }))
      .filter((filter) => filter.value.length > 0)
    : [];

  if (normalizedFilters.length) {
    const semanticQuery = normalizedFilters
      .map((filter) => `${filter.field} ${filter.value}`)
      .join(' ')
      .trim();

    if (!semanticQuery) {
      return [];
    }

    const semanticLimit = cappedLimit ?? 10;
    const semanticRepos = await searchProjects({
      query: semanticQuery,
      limit: semanticLimit,
    });

    const sortedSemantic = sortRepos(semanticRepos, sort);
    if (cappedLimit) {
      return sortedSemantic.slice(0, cappedLimit);
    }
    return sortedSemantic;
  }

  const knowledgeRecords = getKnowledgeRecords();
  let rankedRecords = knowledgeRecords;
  const allRepos = await getRepos();
  const repoMap = new Map(allRepos.map((repo) => [repo.name.toLowerCase(), repo]));
  const repoOrder = new Map(allRepos.map((repo, index) => [repo.name.toLowerCase(), index]));

  if (!normalizedFilters.length && !sort) {
    rankedRecords = [...rankedRecords].sort((a, b) => {
      const aIndex = repoOrder.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = repoOrder.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  }

  const mergedRepos: RepoData[] = [];
  for (const record of rankedRecords) {
    const repo = repoMap.get(record.name.toLowerCase());
    if (repo) {
      mergedRepos.push(augmentRepoWithKnowledge(repo));
    }
  }

  const sortedRepos = sortRepos(mergedRepos, sort);

  if (cappedLimit) {
    return sortedRepos.slice(0, cappedLimit);
  }

  return sortedRepos;
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

export function navigate({ section }: NavigateInput) {
  const map = {
    about: '/about',
    projects: '/projects',
    contact: '/contact',
  } as const;

  return { url: map[section] };
}

export async function searchProjects({ query, limit = 5 }: SearchProjectsInput) {
  if (!query?.trim()) {
    throw new Error('search query is required');
  }

  const targetLimit = Math.max(1, Math.floor(limit));
  const matches = await searchRepoKnowledge(query, targetLimit);
  if (!matches.length) {
    return [];
  }

  const repos = await getRepos();
  const repoMap = new Map(repos.map((repo) => [repo.name.toLowerCase(), repo]));

  const weighted = matches
    .map((match) => {
      const repo = repoMap.get(match.name.toLowerCase());
      if (!repo) {
        return null;
      }
      const hydrated = augmentRepoWithKnowledge(repo);
      const baseScore = Number.isFinite(match.score) ? (match.score as number) : 0;
      const weightedScore = hydrated.isStarred ? baseScore * STARRED_SCORE_BOOST : baseScore;
      return { repo: hydrated, score: weightedScore };
    })
    .filter((entry): entry is { repo: RepoData; score: number } => Boolean(entry));

  const sortedByScore = weighted.sort((a, b) => b.score - a.score).map((entry) => entry.repo);
  return sortedByScore.slice(0, targetLimit);
}

function sortRepos(repos: RepoData[], sort?: 'recent' | 'alphabetical' | 'starred') {
  if (sort === 'recent') {
    return [...repos].sort((a, b) => {
      const toTime = (repo: RepoData) =>
        new Date(repo.pushed_at || repo.updated_at || repo.created_at).getTime();
      return toTime(b) - toTime(a);
    });
  }

  if (sort === 'alphabetical') {
    return [...repos].sort((a, b) => a.name.localeCompare(b.name));
  }

  if (sort === 'starred') {
    return [...repos].sort((a, b) => Number(b.isStarred) - Number(a.isStarred));
  }

  return repos;
}
