import { GH_CONFIG } from '@/lib/constants';
import { resolveSecretValue } from '@/lib/secrets/manager';
import { fetchRepoLanguages as fetchRepoLanguagesBase, getOctokit } from '@portfolio/github-data';
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
