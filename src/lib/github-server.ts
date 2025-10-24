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
    });

    const readmeData = data as {
      content?: string;
      download_url?: string;
    };

    const readmeContent =
      typeof readmeData === 'string'
        ? readmeData
        : readmeData?.content
          ? Buffer.from(readmeData.content, 'base64').toString('utf-8')
          : '';

    const branchFromDownloadUrl = extractBranchFromDownloadUrl(
      typeof readmeData === 'object' ? readmeData?.download_url : undefined
    );

    // Transform relative URLs to absolute URLs pointing to the correct repo
    return convertRelativeToAbsoluteUrls(
      readmeContent,
      owner,
      actualRepoName,
      branchFromDownloadUrl
    );
  } catch (error) {
    console.error('Error fetching readme:', error);

    if (isGithubNotFoundError(error)) {
      return buildMissingReadmeMessage(repo);
    }

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

function extractBranchFromDownloadUrl(url?: string | null): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Pathname format: /owner/repo/branch/path/to/file
    if (segments.length >= 3) {
      return segments[2];
    }
  } catch (error) {
    console.warn('Failed to parse branch from README download URL:', error);
  }

  return undefined;
}

/**
 * Gets the GitHub raw URL for an image in a repository
 * Handles both public and private repos (via their public counterparts)
 * @param repo - The repository name
 * @param imagePath - Path to the image file
 * @param owner - GitHub username (defaults to GITHUB_CONFIG.USERNAME)
 * @returns The raw GitHub URL for the image
 */
export async function getGithubImageUrl(
  repo: string,
  imagePath: string,
  owner: string = GITHUB_CONFIG.USERNAME
): Promise<string> {
  // If path starts with /, it's a local public asset
  if (imagePath.startsWith('/')) {
    return imagePath;
  }

  // If it's an external URL, return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  // Get repo details to determine if it's private and get the default branch
  const repoDetails = await getRepoDetails(repo, owner);

  // For private repos, use the public repo counterpart
  let targetRepo = repo;
  if (repoDetails.private) {
    const portfolioConfig = await getPortfolioConfig();
    const repoConfig = portfolioConfig?.repositories?.find(r => r.name === repo);
    targetRepo = repoConfig?.publicRepo || `${repo}-public`;
  }

  const branch = repoDetails.default_branch || 'main';
  const cleanPath = imagePath
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\?raw=true$/, '');

  return `https://raw.githubusercontent.com/${owner}/${targetRepo}/${branch}/${cleanPath}`;
}

/**
 * Fetches document content from a repository
 * @param repo - The repository name
 * @param docPath - Path to the document
 * @param owner - GitHub username (defaults to GITHUB_CONFIG.USERNAME)
 * @returns Document content and project name
 */
async function fetchDocumentContent(
  repo: string,
  docPath: string,
  owner: string = GITHUB_CONFIG.USERNAME
): Promise<{ content: string; projectName: string }> {
  const octokit = createOctokit();

  try {
    // Check portfolio config for private repos and document overrides
    const portfolioConfig = await getPortfolioConfig();
    const repoConfig = portfolioConfig?.repositories?.find(r => r.name === repo);

    // Check if document is configured in gist
    if (repoConfig?.documents) {
      const docConfig = repoConfig.documents.find(d => d.path === docPath);

      if (docConfig) {
        // Fetch from gist
        const docGistResponse = await octokit.rest.gists.get({
          gist_id: docConfig.gistId,
        });

        const files = docGistResponse.data.files;
        if (files && Object.keys(files).length > 0) {
          let docFile;
          if (docConfig.filename) {
            docFile = files[docConfig.filename];
          } else {
            docFile = files[Object.keys(files)[0]];
          }

          if (docFile && docFile.content) {
            return {
              content: docFile.content,
              projectName: repoConfig.name,
            };
          }
        }
      }
    }

    // For private repos, use public counterpart
    let repoToFetch = repo;
    if (repoConfig?.isPrivate) {
      repoToFetch = repoConfig.publicRepo || `${repo}public`;
    }

    // Fetch from GitHub repository
    const response = await octokit.rest.repos.getContent({
      owner,
      repo: repoToFetch,
      path: docPath,
    });

    if ('content' in response.data && response.data.type === 'file') {
      const content = Buffer.from(response.data.content, 'base64').toString();
      return {
        content,
        projectName: repo,
      };
    }

    throw new Error('Document not found');
  } catch (error) {
    console.error('Error fetching document content:', error);
    throw error;
  }
}

export const getDocumentContent = unstable_cache(
  fetchDocumentContent,
  ['document-content'],
  {
    revalidate: 3600,
    tags: ['github-document']
  }
);

type OctokitError = {
  status?: number;
  response?: {
    status?: number;
  };
};

function isGithubNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as OctokitError;
  return err.status === 404 || err.response?.status === 404;
}

function buildMissingReadmeMessage(repoName: string): string {
  return [
    '# README brewing...',
    '',
    `Thanks for peeking into **${repoName}**! The README is still being written, but the project is very much alive.`,
    '',
    'In the meantime:',
    '- imagine friendly robots tidying up the docs',
    '- expect shiny updates soon',
    '- feel free to star the repo so you do not miss the reveal',
    '',
    '_Check back later for the full tour._',
  ].join('\n');
}
