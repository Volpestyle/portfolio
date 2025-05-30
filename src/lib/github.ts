import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GITHUB_CONFIG } from './constants';

/**
 * Interface representing GitHub repository data
 */
export type RepoData = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  pushed_at: string;
  html_url: string;
  isStarred: boolean;
  default_branch: string;
};

/**
 * Default configuration for React Query hooks
 */
const defaultQueryConfig = {
  staleTime: 1000 * 60 * 60, // 1 hour
  gcTime: 1000 * 60 * 60 * 24, // 24 hours
  retry: 1,
};

/**
 * Hook to check if an image exists in a GitHub repository and get its raw URL
 * @param owner - The GitHub username or organization name
 * @param repo - The repository name
 * @param repoData - Repository data object containing default branch information
 * @param path - Path to the image file in the repository
 * @returns Query object containing the raw image URL if it exists
 */
export function useGithubImage(
  repo: string,
  repoData: RepoData | undefined,
  path: string,
  owner = GITHUB_CONFIG.USERNAME
) {
  return useQuery({
    queryKey: ['image', owner, repo, repoData?.default_branch, path],
    queryFn: async () => {
      if (!repoData?.default_branch) throw new Error('Branch not available');
      const url = getGithubRawUrl(repo, repoData.default_branch, path, owner);
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) throw new Error(`Image not found: ${url}`);
      return url;
    },
    enabled: !!repoData?.default_branch,
    ...defaultQueryConfig,
  });
}

/**
 * Generates a raw GitHub URL for a file
 * @param owner - The GitHub username or organization name
 * @param repo - The repository name
 * @param branch - The branch name
 * @param path - Path to the file in the repository
 * @returns Raw GitHub URL for the file
 */
export function getGithubRawUrl(repo: string, branch: string, path: string, owner = GITHUB_CONFIG.USERNAME): string {
  const cleanPath = path.replace(/^\.\//, '').replace(/\?raw=true$/, '');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}`;
}

export type PortfolioReposResponse = { starred: RepoData[]; normal: RepoData[] };

/**
 * Hook to fetch portfolio repositories, both 'starred' and 'normal'
 * Starred repos in this context are the ones I designated in PORTFOLIO_GIST_ID
 * @returns Query object containing an object with starred and normal repositories
 */
export function usePortfolioRepos() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['portfolioRepos'],
    queryFn: async () => {
      const response = await fetch('/api/github/portfolio-repos');
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio repos');
      }
      const data = (await response.json()) as PortfolioReposResponse;

      // Pre-fill cache for each repo
      [...data.starred, ...data.normal].forEach((repo) => {
        // Cache for 'repo' query
        queryClient.setQueryData(['repo', repo.name], repo);
      });

      return data;
    },
    ...defaultQueryConfig,
  });
}

/**
 * Hook to fetch detailed information about a specific repository
 * @param owner - The GitHub username or organization name
 * @param repo - The repository name
 * @returns Query object containing detailed repository information
 */
export function useRepoDetails(repo: string, owner: string = GITHUB_CONFIG.USERNAME) {
  return useQuery({
    queryKey: ['repo', repo],
    queryFn: async () => {
      const response = await fetch(`/api/github/repo-info/${owner}/${repo}`);
      if (!response.ok) {
        throw new Error('Failed to fetch repo details');
      }
      const data = await response.json();
      return data as RepoData;
    },
    ...defaultQueryConfig,
  });
}

/**
 * Hook to fetch and parse the README content of a repository
 * @param owner - The GitHub username or organization name
 * @param repo - The repository name
 * @returns Query object containing the README content as a string
 */
export function useRepoReadme(repo: string, owner: string = GITHUB_CONFIG.USERNAME) {
  return useQuery({
    queryKey: ['repoReadme', repo],
    queryFn: async () => {
      const response = await fetch(`/api/github/readme/${owner}/${repo}`);
      if (!response.ok) {
        throw new Error('Failed to fetch readme');
      }
      const { readme } = await response.json();

      if (!readme) {
        throw new Error('README content is missing from the response');
      }

      return readme;
    },
    ...defaultQueryConfig,
  });
}
