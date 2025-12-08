import type { RepoData } from '@portfolio/chat-contract';
import { GH_CONFIG } from './constants';
import {
  createOctokit,
  getPortfolioConfig,
  resolveGitHubToken,
  fetchRepoLanguages,
  calculateLanguagePercentages,
} from './github-api';
import { unstable_cache } from 'next/cache';
import { convertRelativeToAbsoluteUrls } from './readme-utils';
import { assertNoFixtureFlagsInProd, shouldUseFixtureRuntime } from '@/lib/test-flags';

export type { RepoData };

/**
 * Check if SSR pages should use test fixtures. This is used for build-time
 * rendering where we don't have request headers, so we rely on an explicit
 * runtime flag that the Playwright runner enables during `pnpm test`.
 */
function shouldUseSSRFixtures(): boolean {
  assertNoFixtureFlagsInProd();
  return shouldUseFixtureRuntime();
}

export type PortfolioReposResponse = {
  starred: RepoData[];
  normal: RepoData[];
};

// Removed cloneRepo function - no longer needed since we don't return mock data

export async function fetchPortfolioRepos(): Promise<PortfolioReposResponse> {
  // Return fixtures for test builds (SSR during CI test runs)
  if (shouldUseSSRFixtures()) {
    const { TEST_REPO } = await import('@portfolio/test-support/fixtures');
    return {
      starred: [TEST_REPO],
      normal: [],
    };
  }

  const token = await resolveGitHubToken();
  if (!token) {
    throw new Error('GitHub token is not configured');
  }
  if (!process.env.PORTFOLIO_GIST_ID) {
    throw new Error('Portfolio gist ID is not configured');
  }

  const octokit = await createOctokit(token);

  try {
    const portfolioConfig = await getPortfolioConfig();

    if (!portfolioConfig) {
      throw new Error('Portfolio configuration file not found in gist');
    }

    if (!Array.isArray(portfolioConfig.repositories)) {
      throw new Error('Invalid portfolio configuration: repositories must be an array');
    }

    const repos = await octokit.rest.repos.listForUser({
      username: GH_CONFIG.USERNAME,
      per_page: 100,
    });

    const publicRepoMap = new Map(repos.data.map((r) => [r.name, r]));

    const processedRepos: RepoData[] = [];

    for (const repoConfig of portfolioConfig.repositories) {
      const publicRepo = publicRepoMap.get(repoConfig.name);

      if (publicRepo) {
        // Fetch language data for public repos
        const owner = publicRepo.owner?.login || GH_CONFIG.USERNAME;
        const languagesBreakdown = await fetchRepoLanguages(owner, publicRepo.name);
        const languagePercentages = languagesBreakdown ? calculateLanguagePercentages(languagesBreakdown) : undefined;

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
          languagesBreakdown: languagesBreakdown ?? undefined,
          languagePercentages,
        });
      } else if (repoConfig.isPrivate) {
        const privateRepoData: RepoData = {
          name: repoConfig.name,
          full_name: `${repoConfig.owner || GH_CONFIG.USERNAME}/${repoConfig.name}`,
          private: true,
          owner: {
            login: repoConfig.owner || GH_CONFIG.USERNAME,
          },
          description: repoConfig.description || null,
          homepage: repoConfig.homepage || repoConfig.demoUrl || null,
          language: repoConfig.language || null,
          topics: repoConfig.topics,
          created_at: repoConfig.createdAt || new Date().toISOString(),
          updated_at: repoConfig.updatedAt || new Date().toISOString(),
          isStarred: repoConfig.isStarred || false,
          icon: repoConfig.icon,
          languagePercentages: repoConfig.languages,
        };
        processedRepos.push(privateRepoData);
      }
    }

    return {
      starred: processedRepos.filter((repo) => repo.isStarred),
      normal: processedRepos.filter((repo) => !repo.isStarred),
    };
  } catch (error) {
    console.error('Error fetching portfolio repos:', error);
    throw error;
  }
}

export const getPortfolioRepos = unstable_cache(fetchPortfolioRepos, ['portfolio-repos'], {
  revalidate: 3600, // Cache for 1 hour
  tags: ['github-repos'],
});

export async function fetchRepoDetails(repo: string, owner: string = GH_CONFIG.USERNAME): Promise<RepoData> {
  // Return fixtures for test builds
  if (shouldUseSSRFixtures()) {
    const { TEST_REPO } = await import('@portfolio/test-support/fixtures');
    return { ...TEST_REPO, name: repo, owner: { login: owner } };
  }

  const token = await resolveGitHubToken();
  if (!token) throw new Error('GitHub token is not configured');
  const octokit = await createOctokit(token);

  try {
    // First try to get from portfolio config for private repos
    const portfolioConfig = await getPortfolioConfig();
    const repoConfig = portfolioConfig?.repositories?.find((r) => r.name === repo);

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
        languagePercentages: repoConfig.languages,
      };
    }

    // For public repos, fetch from GitHub
    const { data } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    // Fetch language data
    const languagesBreakdown = await fetchRepoLanguages(owner, repo);
    const languagePercentages = languagesBreakdown ? calculateLanguagePercentages(languagesBreakdown) : undefined;

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
      languagesBreakdown: languagesBreakdown ?? undefined,
      languagePercentages,
    };
  } catch (error) {
    console.error('Error fetching repo details:', error);
    throw error;
  }
}

export const getRepoDetails = unstable_cache(fetchRepoDetails, ['repo-details'], {
  revalidate: 3600,
  tags: ['github-repo'],
});

export async function fetchRepoReadme(repo: string, owner: string = GH_CONFIG.USERNAME): Promise<string> {
  // Return fixtures for test builds
  if (shouldUseSSRFixtures()) {
    const { TEST_README } = await import('@portfolio/test-support/fixtures');
    return TEST_README;
  }

  const token = await resolveGitHubToken();
  if (!token) throw new Error('GitHub token is not configured');
  const octokit = await createOctokit(token);

  let actualRepoName = repo;

  try {
    // First check portfolio config for private repos
    const portfolioConfig = await getPortfolioConfig();
    const repoConfig = portfolioConfig?.repositories?.find((r) => r.name === repo);

    // Determine the actual repo name to fetch from
    if (repoConfig?.isPrivate) {
      actualRepoName = repoConfig.publicRepo || `${repo}-public`;
    }

    // If we have inline README content for private repos
    if (repoConfig?.isPrivate && repoConfig.readme) {
      // Transform relative URLs to point to the public repo
      return convertRelativeToAbsoluteUrls(repoConfig.readme, owner, actualRepoName, undefined, 'README.md');
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

    const readmeContent = readmeData?.content ? Buffer.from(readmeData.content, 'base64').toString('utf-8') : '';

    const branchFromDownloadUrl = extractBranchFromDownloadUrl(readmeData?.download_url);

    // Transform relative URLs to absolute URLs pointing to the correct repo
    return convertRelativeToAbsoluteUrls(readmeContent, owner, actualRepoName, branchFromDownloadUrl, 'README.md');
  } catch (error) {
    if (isGithubNotFoundError(error)) {
      console.warn(`[github-server] README not found for ${owner}/${actualRepoName}. Using placeholder content.`);
      return buildMissingReadmeMessage(repo);
    }

    console.error('Error fetching readme:', error);
    throw error;
  }
}

export const getRepoReadme = unstable_cache(fetchRepoReadme, ['repo-readme'], {
  revalidate: 3600,
  tags: ['github-readme'],
});

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
 * Fetches document content from a repository
 * @param repo - The repository name
 * @param docPath - Path to the document
 * @param owner - GitHub username (defaults to GH_CONFIG.USERNAME)
 * @returns Document content and project name
 */
export async function fetchDocumentContent(
  repo: string,
  docPath: string,
  owner: string = GH_CONFIG.USERNAME
): Promise<{ content: string; projectName: string }> {
  // Return fixtures for test builds
  if (shouldUseSSRFixtures()) {
    const { TEST_DOC_CONTENT } = await import('@portfolio/test-support/fixtures');
    return {
      content: TEST_DOC_CONTENT,
      projectName: repo,
    };
  }

  const token = await resolveGitHubToken();
  if (!token) throw new Error('GitHub token is not configured');
  const octokit = await createOctokit(token);

  try {
    // Check portfolio config for private repos and document overrides
    const portfolioConfig = await getPortfolioConfig();
    const repoConfig = portfolioConfig?.repositories?.find((r) => r.name === repo);

    // Check if document is configured in gist
    if (repoConfig?.documents) {
      const docConfig = repoConfig.documents.find((d) => d.path === docPath);

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
      repoToFetch = repoConfig.publicRepo || `${repo}-public`;
    }

    // Fetch from GitHub repository
    const response = await octokit.rest.repos.getContent({
      owner,
      repo: repoToFetch,
      path: docPath,
    });

    if ('content' in response.data && response.data.type === 'file') {
      const content = Buffer.from(response.data.content, 'base64').toString();
      const branchFromDownloadUrl = extractBranchFromDownloadUrl(response.data.download_url);
      const normalizedContent = convertRelativeToAbsoluteUrls(
        content,
        owner,
        repoToFetch,
        branchFromDownloadUrl,
        docPath
      );
      return {
        content: normalizedContent,
        projectName: repo,
      };
    }

    throw new Error('Document not found');
  } catch (error) {
    console.error('Error fetching document content:', error);
    throw error;
  }
}

export const getDocumentContent = unstable_cache(fetchDocumentContent, ['document-content'], {
  revalidate: 3600,
  tags: ['github-document'],
});

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

async function fetchDirectoryContents(
  repo: string,
  dirPath: string,
  owner: string = GH_CONFIG.USERNAME
): Promise<DirectoryEntry[]> {
  const token = await resolveGitHubToken();
  if (!token) throw new Error('GitHub token is not configured');
  const octokit = await createOctokit(token);

  const portfolioConfig = await getPortfolioConfig();
  const repoConfig = portfolioConfig?.repositories?.find((r) => r.name === repo);

  let repoToFetch = repo;
  if (repoConfig?.isPrivate) {
    repoToFetch = repoConfig.publicRepo || `${repo}-public`;
  }

  const response = await octokit.rest.repos.getContent({
    owner,
    repo: repoToFetch,
    path: dirPath,
  });

  if (!Array.isArray(response.data)) {
    throw new Error('Path is not a directory');
  }

  return response.data
    .filter((item) => item.type === 'file' || item.type === 'dir')
    .map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type as 'file' | 'dir',
    }))
    .sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export const getDirectoryContents = unstable_cache(fetchDirectoryContents, ['directory-contents'], {
  revalidate: 3600,
  tags: ['github-directory'],
});

export async function getRepos(): Promise<RepoData[]> {
  const { starred, normal } = await getPortfolioRepos();
  return [...starred, ...normal];
}

export async function getRepoByName(name: string): Promise<RepoData> {
  const repos = await getRepos();
  const match = repos.find((repo) => repo.name.toLowerCase() === name.toLowerCase());
  if (match) {
    return match;
  }
  return getRepoDetails(name);
}

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
