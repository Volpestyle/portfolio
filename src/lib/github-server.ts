import { GITHUB_CONFIG } from './constants';
import { createOctokit, getPortfolioConfig } from './github-api';
import { PortfolioRepoConfig, PrivateRepoData } from '@/types/portfolio';
import { unstable_cache } from 'next/cache';
import { convertRelativeToAbsoluteUrls } from './readme-utils';

export type RepoData = {
  id?: number;
  name: string;
  full_name?: string;
  description: string | null;
  created_at: string;
  pushed_at?: string | null;
  updated_at?: string | null;
  html_url?: string;
  isStarred: boolean;
  default_branch?: string;
  private?: boolean;
  icon?: string;
  owner?: {
    login: string;
  };
  homepage?: string | null;
  language?: string | null;
  topics?: string[];
};

export type PortfolioReposResponse = {
  starred: RepoData[];
  normal: RepoData[]
};

async function fetchPortfolioRepos(): Promise<PortfolioReposResponse> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GitHub token is not configured');
  }

  if (!process.env.PORTFOLIO_GIST_ID) {
    throw new Error('Portfolio gist ID is not configured');
  }

  const octokit = createOctokit();

  try {
    const portfolioConfig = await getPortfolioConfig();

    if (!portfolioConfig) {
      throw new Error('Portfolio configuration file not found in gist');
    }

    if (!Array.isArray(portfolioConfig.repositories)) {
      throw new Error('Invalid portfolio configuration: repositories must be an array');
    }

    const repos = await octokit.rest.repos.listForUser({
      username: GITHUB_CONFIG.USERNAME,
      per_page: 100,
    });

    const portfolioRepoMap = new Map<string, PortfolioRepoConfig>(
      portfolioConfig.repositories.map((r) => [r.name, r])
    );

    const publicRepoMap = new Map(repos.data.map((r) => [r.name, r]));

    const processedRepos: RepoData[] = [];

    for (const repoConfig of portfolioConfig.repositories) {
      const publicRepo = publicRepoMap.get(repoConfig.name);

      if (publicRepo) {
        processedRepos.push({
          id: publicRepo.id,
          name: publicRepo.name,
          full_name: publicRepo.full_name,
          description: publicRepo.description,
          created_at: publicRepo.created_at || new Date().toISOString(),
          pushed_at: publicRepo.pushed_at || publicRepo.updated_at || null,
          updated_at: publicRepo.updated_at || null,
          html_url: publicRepo.html_url,
          default_branch: publicRepo.default_branch,
          private: publicRepo.private,
          owner: publicRepo.owner,
          isStarred: repoConfig.isStarred || false,
          icon: repoConfig.icon,
        });
      } else if (repoConfig.isPrivate) {
        const privateRepoData: RepoData = {
          name: repoConfig.name,
          full_name: `${repoConfig.owner || GITHUB_CONFIG.USERNAME}/${repoConfig.name}`,
          private: true,
          owner: {
            login: repoConfig.owner || GITHUB_CONFIG.USERNAME,
          },
          description: repoConfig.description || null,
          homepage: repoConfig.homepage || repoConfig.demoUrl || null,
          language: repoConfig.language || null,
          topics: repoConfig.topics,
          created_at: repoConfig.createdAt || new Date().toISOString(),
          updated_at: repoConfig.updatedAt || new Date().toISOString(),
          isStarred: repoConfig.isStarred || false,
          icon: repoConfig.icon,
        };
        processedRepos.push(privateRepoData);
      }
    }

    return {
      starred: processedRepos.filter(repo => repo.isStarred),
      normal: processedRepos.filter(repo => !repo.isStarred),
    };
  } catch (error) {
    console.error('Error fetching portfolio repos:', error);
    throw error;
  }
}

export const getPortfolioRepos = unstable_cache(
  fetchPortfolioRepos,
  ['portfolio-repos'],
  {
    revalidate: 3600, // Cache for 1 hour
    tags: ['github-repos']
  }
);

async function fetchRepoDetails(repo: string, owner: string = GITHUB_CONFIG.USERNAME): Promise<RepoData> {
  const octokit = createOctokit();

  try {
    // First try to get from portfolio config for private repos
    const portfolioConfig = await getPortfolioConfig();
    const repoConfig = portfolioConfig?.repositories?.find(r => r.name === repo);

    if (repoConfig?.isPrivate) {
      return {
        name: repoConfig.name,
        full_name: `${repoConfig.owner || owner}/${repoConfig.name}`,
        private: true,
        owner: {
          login: repoConfig.owner || owner,
        },
        description: repoConfig.description || null,
        homepage: repoConfig.homepage || repoConfig.demoUrl || null,
        language: repoConfig.language || null,
        topics: repoConfig.topics,
        created_at: repoConfig.createdAt || new Date().toISOString(),
        updated_at: repoConfig.updatedAt || new Date().toISOString(),
        pushed_at: repoConfig.updatedAt || new Date().toISOString(),
        isStarred: repoConfig.isStarred || false,
        icon: repoConfig.icon,
      };
    }

    // For public repos, fetch from GitHub
    const { data } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    return {
      id: data.id,
      name: data.name,
      full_name: data.full_name,
      description: data.description,
      created_at: data.created_at,
      pushed_at: data.pushed_at,
      updated_at: data.updated_at,
      html_url: data.html_url,
      default_branch: data.default_branch,
      private: data.private,
      owner: data.owner,
      homepage: data.homepage,
      language: data.language,
      topics: data.topics,
      isStarred: repoConfig?.isStarred || false,
      icon: repoConfig?.icon,
    };
  } catch (error) {
    console.error('Error fetching repo details:', error);
    throw error;
  }
}

export const getRepoDetails = unstable_cache(
  fetchRepoDetails,
  ['repo-details'],
  {
    revalidate: 3600,
    tags: ['github-repo']
  }
);

async function fetchRepoReadme(repo: string, owner: string = GITHUB_CONFIG.USERNAME): Promise<string> {
  const octokit = createOctokit();

  try {
    // First check portfolio config for private repos
    const portfolioConfig = await getPortfolioConfig();
    const repoConfig = portfolioConfig?.repositories?.find(r => r.name === repo);

    // Determine the actual repo name to fetch from
    let actualRepoName = repo;
    if (repoConfig?.isPrivate) {
      actualRepoName = repoConfig.publicRepo || `${repo}-public`;
    }

    // If we have inline README content for private repos
    if (repoConfig?.isPrivate && repoConfig.readme) {
      // Transform relative URLs to point to the public repo
      return convertRelativeToAbsoluteUrls(repoConfig.readme, owner, actualRepoName);
    }

    // Fetch README from GitHub (public repo or public counterpart of private repo)
    const { data } = await octokit.rest.repos.getReadme({
      owner,
      repo: actualRepoName,
      headers: {
        accept: 'application/vnd.github.raw',
      },
    });

    const readmeContent = data as any;

    // Transform relative URLs to absolute URLs pointing to the correct repo
    return convertRelativeToAbsoluteUrls(readmeContent, owner, actualRepoName);
  } catch (error) {
    console.error('Error fetching readme:', error);
    throw error;
  }
}

export const getRepoReadme = unstable_cache(
  fetchRepoReadme,
  ['repo-readme'],
  {
    revalidate: 3600,
    tags: ['github-readme']
  }
);