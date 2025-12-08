import { GH_CONFIG } from '@/lib/constants';
import { PortfolioConfig } from '@/types/portfolio';
import { resolveSecretValue } from '@/lib/secrets/manager';
import { fetchPortfolioConfig, fetchRepoLanguages as fetchRepoLanguagesBase, getOctokit } from '@portfolio/github-data';
import { loadPortfolioConfig } from '@/server/portfolio/config-store';
export { calculateLanguagePercentages } from '@portfolio/github-data';

export async function resolveGitHubToken(): Promise<string | null> {
  const envToken = process.env.GH_TOKEN ?? null;
  if (envToken) return envToken;
  try {
    const fromSecret = await resolveSecretValue('GH_TOKEN', { scope: 'repo' });
    return fromSecret ?? null;
  } catch {
    return null;
  }
}

export async function createOctokit(token: string) {
  return getOctokit({ token });
}

export async function getPortfolioConfig(): Promise<PortfolioConfig | null> {
  const stored = await loadPortfolioConfig();
  if (stored?.repositories?.length) {
    return stored;
  }

  const gistId = process.env.PORTFOLIO_GIST_ID;
  if (!gistId) {
    console.error('Portfolio config is not available in S3 and PORTFOLIO_GIST_ID is not configured');
    return null;
  }

  const token = await resolveGitHubToken();
  if (!token) {
    console.error('GitHub token not configured');
    return null;
  }

  const fetched = await fetchPortfolioConfig({
    token,
    gistId,
    configFileName: GH_CONFIG.PORTFOLIO_CONFIG_FILENAME,
  });

  if (!fetched) {
    return null;
  }

  return {
    repositories: fetched.repositories.map((repo) => ({
      name: repo.name,
      publicRepo: repo.publicRepo,
      isStarred: repo.isStarred,
      isPrivate: repo.isPrivate,
      owner: repo.owner,
      description: repo.description ?? undefined,
      readme: repo.readme ?? undefined,
      readmeGistId: undefined,
      documents: [],
      techStack: repo.techStack,
      demoUrl: repo.demoUrl ?? undefined,
      screenshots: repo.screenshots,
      topics: repo.topics,
      language: repo.language ?? undefined,
      languages: repo.languages
        ? Object.entries(repo.languages).map(([name, percent]) => ({ name, percent }))
        : repo.languagePercentages,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      homepage: repo.homepage ?? undefined,
      icon: repo.icon,
    })),
  };
}

/**
 * Fetches language breakdown for a repository
 * Returns a map of language names to byte counts
 */
export async function fetchRepoLanguages(owner: string, repo: string): Promise<Record<string, number> | null> {
  try {
    const token = await resolveGitHubToken();
    if (!token) {
      console.error('GitHub token not configured');
      return null;
    }
    const result = await fetchRepoLanguagesBase({
      token,
      owner,
      repo,
    });
    return result;
  } catch (error) {
    console.error(`Error fetching languages for ${owner}/${repo}:`, error);
    return null;
  }
}

export type GitHubRepoSummary = {
  name: string;
  owner: string;
  description?: string | null;
  private: boolean;
  html_url?: string;
  topics?: string[];
  language?: string | null;
  default_branch?: string;
};

export async function listAllGitHubRepos(): Promise<GitHubRepoSummary[]> {
  const token = await resolveGitHubToken();
  if (!token) {
    throw new Error('GitHub token not configured');
  }

  const octokit = await createOctokit(token);

  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: 'updated',
    direction: 'desc',
  });

  return repos.map((repo) => ({
    name: repo.name,
    owner: repo.owner?.login ?? GH_CONFIG.USERNAME,
    description: repo.description,
    private: repo.private ?? false,
    html_url: repo.html_url,
    topics: Array.isArray(repo.topics) ? repo.topics : undefined,
    language: repo.language,
    default_branch: repo.default_branch,
  }));
}
