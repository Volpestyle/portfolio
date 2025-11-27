import { GH_CONFIG } from '@/lib/constants';
import { PortfolioConfig } from '@/types/portfolio';
import { resolveSecretValue } from '@/lib/secrets/manager';
import { fetchPortfolioConfig, fetchRepoLanguages as fetchRepoLanguagesBase, getOctokit } from '@portfolio/github-data';
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
  const gistId = process.env.PORTFOLIO_GIST_ID;
  if (!gistId) {
    console.error('Portfolio gist ID not configured');
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
export async function fetchRepoLanguages(
  owner: string,
  repo: string
): Promise<Record<string, number> | null> {
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
