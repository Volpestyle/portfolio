import { Octokit } from '@octokit/rest';
import type { RepoData } from '@portfolio/chat-contract';

type PortfolioRepoConfig = {
  name: string;
  owner?: string;
  description?: string | null;
  homepage?: string | null;
  demoUrl?: string | null;
  techStack?: string[];
  screenshots?: string[];
  language?: string | null;
  topics?: string[];
  createdAt?: string;
  updatedAt?: string;
  isPrivate?: boolean;
  isStarred?: boolean;
  icon?: string;
  languages?: Record<string, number>;
  languagePercentages?: Array<{ name: string; percent: number }>;
  publicRepo?: string;
  readme?: string;
};

type PortfolioConfig = {
  repositories: PortfolioRepoConfig[];
};

type PortfolioReposResponse = {
  starred: RepoData[];
  normal: RepoData[];
};

type ResolveOctokitOptions = {
  token?: string;
  octokit?: Octokit;
};

type FetchPortfolioConfigOptions = ResolveOctokitOptions & {
  gistId: string;
  configFileName?: string;
};

type FetchPortfolioReposOptions = ResolveOctokitOptions & {
  gistId: string;
  configFileName?: string;
  defaultUsername?: string;
};

type FetchRepoLanguagesOptions = ResolveOctokitOptions & {
  owner: string;
  repo: string;
};

type FetchRepoReadmeOptions = ResolveOctokitOptions & {
  owner?: string;
  repo: string;
  inlineReadme?: string;
  publicRepoName?: string;
};

const DEFAULT_USERNAME = 'volpestyle';
const DEFAULT_CONFIG_FILENAME = 'portfolio-config.json';
const octokitByToken = new Map<string, Octokit>();

export function calculateLanguagePercentages(languagesBreakdown: Record<string, number>): Array<{ name: string; percent: number }> {
  const totalBytes = Object.values(languagesBreakdown).reduce((sum, bytes) => sum + bytes, 0);
  if (!totalBytes) {
    return [];
  }
  return Object.entries(languagesBreakdown)
    .map(([name, bytes]) => ({
      name,
      percent: Math.round((bytes / totalBytes) * 10000) / 100,
    }))
    .sort((a, b) => b.percent - a.percent);
}

function decodeReadmeContent(data: { content?: string } | undefined): string {
  if (!data || typeof data.content !== 'string') {
    return '';
  }
  return Buffer.from(data.content, 'base64').toString('utf-8');
}

async function resolveOctokit(options?: ResolveOctokitOptions): Promise<Octokit> {
  if (options?.octokit) {
    return options.octokit;
  }
  const token = options?.token ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error('GH_TOKEN is required to access GitHub.');
  }
  const existing = octokitByToken.get(token);
  if (existing) {
    return existing;
  }
  const client = new Octokit({ auth: token });
  octokitByToken.set(token, client);
  return client;
}

export async function fetchPortfolioConfig(options: FetchPortfolioConfigOptions): Promise<PortfolioConfig | null> {
  const octokit = await resolveOctokit(options);
  const gistId = options.gistId;
  const configFileName = options.configFileName ?? DEFAULT_CONFIG_FILENAME;
  if (!gistId) {
    return null;
  }

  try {
    const { data } = await octokit.rest.gists.get({ gist_id: gistId });
    const raw = data.files?.[configFileName]?.content;
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PortfolioConfig;
  } catch (error) {
    console.error('[github-data] Failed to fetch portfolio config', error);
    return null;
  }
}

export async function fetchRepoLanguages(options: FetchRepoLanguagesOptions): Promise<Record<string, number> | null> {
  const octokit = await resolveOctokit(options);
  try {
    const res = await octokit.rest.repos.listLanguages({
      owner: options.owner,
      repo: options.repo,
    });
    return res.data ?? null;
  } catch (error) {
    console.error(`[github-data] Failed to fetch languages for ${options.owner}/${options.repo}`, error);
    return null;
  }
}

async function buildRepoRecord(
  repoConfig: PortfolioRepoConfig,
  octokit: Octokit,
  defaultUsername: string
): Promise<RepoData> {
  const owner = repoConfig.owner || defaultUsername;

  if (repoConfig.isPrivate) {
    const languagesBreakdown =
      repoConfig.languages ?? (await fetchRepoLanguages({ octokit, owner, repo: repoConfig.name })) ?? undefined;

    return {
      name: repoConfig.name,
      full_name: `${owner}/${repoConfig.name}`,
      private: true,
      owner: { login: owner },
      description: repoConfig.description ?? null,
      homepage: repoConfig.homepage ?? repoConfig.demoUrl ?? null,
      language: repoConfig.language ?? null,
      topics: repoConfig.topics,
      created_at: repoConfig.createdAt ?? new Date().toISOString(),
      updated_at: repoConfig.updatedAt ?? new Date().toISOString(),
      pushed_at: repoConfig.updatedAt ?? null,
      isStarred: repoConfig.isStarred ?? false,
      icon: repoConfig.icon,
      languagesBreakdown,
      languagePercentages: languagesBreakdown ? calculateLanguagePercentages(languagesBreakdown) : undefined,
    };
  }

  const { data } = await octokit.rest.repos.get({ owner, repo: repoConfig.name });
  const languagesBreakdown =
    repoConfig.languages ?? (await fetchRepoLanguages({ octokit, owner, repo: repoConfig.name })) ?? undefined;
  const languagePercentages = languagesBreakdown ? calculateLanguagePercentages(languagesBreakdown) : undefined;

  return {
    id: data.id,
    name: data.name,
    full_name: data.full_name,
    description: data.description,
    created_at: data.created_at,
    updated_at: data.updated_at,
    pushed_at: data.pushed_at ?? data.updated_at ?? null,
    html_url: data.html_url,
    default_branch: data.default_branch,
    private: data.private,
    owner: data.owner as RepoData['owner'],
    homepage: data.homepage,
    language: data.language,
    topics: data.topics as string[] | undefined,
    isStarred: repoConfig.isStarred ?? false,
    icon: repoConfig.icon,
    languagesBreakdown,
    languagePercentages,
  };
}

export async function fetchPortfolioRepos(options: FetchPortfolioReposOptions): Promise<PortfolioReposResponse> {
  const octokit = await resolveOctokit(options);
  const gistId = options.gistId;
  const defaultUsername = options.defaultUsername ?? DEFAULT_USERNAME;
  if (!gistId) {
    throw new Error('gistId is required to fetch portfolio repos.');
  }

  const portfolioConfig = await fetchPortfolioConfig({
    octokit,
    gistId,
    configFileName: options.configFileName,
  });

  if (!portfolioConfig?.repositories?.length) {
    return { starred: [], normal: [] };
  }

  const repos: RepoData[] = [];
  for (const repoConfig of portfolioConfig.repositories) {
    repos.push(await buildRepoRecord(repoConfig, octokit, defaultUsername));
  }

  return {
    starred: repos.filter((repo) => repo.isStarred),
    normal: repos.filter((repo) => !repo.isStarred),
  };
}

export async function fetchRepoReadme(options: FetchRepoReadmeOptions): Promise<string> {
  if (options.inlineReadme) {
    return options.inlineReadme;
  }
  const octokit = await resolveOctokit(options);
  const owner = options.owner ?? DEFAULT_USERNAME;
  const repo = options.publicRepoName ?? options.repo;

  const { data } = await octokit.rest.repos.getReadme({ owner, repo });
  return decodeReadmeContent(data as { content?: string });
}

export async function getOctokit(options?: ResolveOctokitOptions): Promise<Octokit> {
  return resolveOctokit(options);
}
