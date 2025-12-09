import type { RepoData } from '@portfolio/chat-contract';
import { GH_CONFIG } from './constants';
import {
  createOctokit,
  resolveGitHubToken,
  fetchRepoLanguages,
  calculateLanguagePercentages,
} from './github-api';
import { unstable_cache } from 'next/cache';
import { convertRelativeToAbsoluteUrls } from './readme-utils';
import { assertNoFixtureFlagsInProd, shouldUseFixtureRuntime } from '@/lib/test-flags';
import { getVisibleProjects, getAllProjects, type PortfolioProjectRecord } from '@/server/portfolio/store';
import { normalizeProjectKey } from '@/lib/projects/normalize';

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

function findProjectMetadata(projects: PortfolioProjectRecord[], repo: string): PortfolioProjectRecord | null {
  const target = normalizeProjectKey(repo);
  return projects.find((project) => normalizeProjectKey(project.name) === target) ?? null;
}

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

  const octokit = await createOctokit(token);

  try {
    const projects = await getVisibleProjects();

    // If no projects configured, fall back to showing all public repos
    if (!projects.length) {
      const repos = await octokit.rest.repos.listForUser({
        username: GH_CONFIG.USERNAME,
        per_page: 100,
        sort: 'updated',
      });

      const publicRepos: RepoData[] = await Promise.all(
        repos.data
          .filter((repo) => !repo.private && !repo.fork)
          .slice(0, 12)
          .map(async (repo) => {
            const languagesBreakdown = await fetchRepoLanguages(repo.owner?.login || GH_CONFIG.USERNAME, repo.name);
            const languagePercentages = languagesBreakdown ? calculateLanguagePercentages(languagesBreakdown) : undefined;
            return {
              id: repo.id,
              name: repo.name,
              full_name: repo.full_name,
              description: repo.description,
              created_at: repo.created_at || new Date().toISOString(),
              pushed_at: repo.pushed_at || repo.updated_at || null,
              updated_at: repo.updated_at || null,
              html_url: repo.html_url,
              default_branch: repo.default_branch,
              private: repo.private,
              owner: repo.owner,
              homepage: repo.homepage,
              language: repo.language,
              topics: repo.topics,
              isStarred: false,
              languagesBreakdown: languagesBreakdown ?? undefined,
              languagePercentages,
            };
          })
      );

      return { starred: [], normal: publicRepos };
    }

    const repos = await octokit.rest.repos.listForUser({
      username: GH_CONFIG.USERNAME,
      per_page: 100,
    });

    const publicRepoMap = new Map(repos.data.map((repo) => [normalizeProjectKey(repo.name), repo]));
    const starred: RepoData[] = [];
    const normal: RepoData[] = [];

    for (const project of projects) {
      const projectKey = normalizeProjectKey(project.name);
      const publicRepo = publicRepoMap.get(projectKey);
      const owner = project.owner || GH_CONFIG.USERNAME;

      if (publicRepo) {
        const languagesBreakdown = await fetchRepoLanguages(publicRepo.owner?.login || owner, publicRepo.name);
        const languagePercentages = languagesBreakdown ? calculateLanguagePercentages(languagesBreakdown) : undefined;

        const repoRecord: RepoData = {
          id: publicRepo.id,
          name: publicRepo.name,
          full_name: publicRepo.full_name,
          description: project.description ?? publicRepo.description,
          created_at: publicRepo.created_at || new Date().toISOString(),
          pushed_at: publicRepo.pushed_at || publicRepo.updated_at || null,
          updated_at: publicRepo.updated_at || null,
          html_url: publicRepo.html_url,
          default_branch: publicRepo.default_branch,
          private: publicRepo.private,
          owner: publicRepo.owner,
          homepage: publicRepo.homepage,
          language: project.language ?? publicRepo.language,
          topics: project.topics ?? publicRepo.topics,
          isStarred: Boolean(project.isStarred),
          icon: project.icon,
          languagesBreakdown: languagesBreakdown ?? undefined,
          languagePercentages,
        };

        if (project.isStarred) {
          starred.push(repoRecord);
        } else {
          normal.push(repoRecord);
        }
        continue;
      }

      const fallbackRepo: RepoData = {
        name: project.name,
        full_name: `${owner}/${project.name}`,
        private: true,
        owner: {
          login: owner,
        },
        description: project.description ?? null,
        homepage: null,
        language: project.language ?? null,
        topics: project.topics,
        created_at: project.updatedAt || new Date().toISOString(),
        updated_at: project.updatedAt || new Date().toISOString(),
        isStarred: Boolean(project.isStarred),
        icon: project.icon,
      };

      if (project.isStarred) {
        starred.push(fallbackRepo);
      } else {
        normal.push(fallbackRepo);
      }
    }

    return { starred, normal };
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
  const allProjects = await getAllProjects();
  const projectMetadata = findProjectMetadata(allProjects, repo);

  try {
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
      language: projectMetadata?.language ?? data.language,
      topics: projectMetadata?.topics ?? data.topics,
      isStarred: Boolean(projectMetadata?.isStarred),
      icon: projectMetadata?.icon,
      languagesBreakdown: languagesBreakdown ?? undefined,
      languagePercentages,
    };
  } catch (error) {
    if (projectMetadata) {
      const repoOwner = projectMetadata.owner || owner;
      return {
        name: projectMetadata.name,
        full_name: `${repoOwner}/${projectMetadata.name}`,
        private: true,
        owner: {
          login: repoOwner,
        },
        description: projectMetadata.description ?? null,
        homepage: null,
        language: projectMetadata.language ?? null,
        topics: projectMetadata.topics,
        created_at: projectMetadata.updatedAt || new Date().toISOString(),
        updated_at: projectMetadata.updatedAt || new Date().toISOString(),
        pushed_at: projectMetadata.updatedAt || null,
        isStarred: Boolean(projectMetadata.isStarred),
        icon: projectMetadata.icon,
      };
    }

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

  try {
    const { data } = await octokit.rest.repos.getReadme({
      owner,
      repo,
    });

    const readmeData = data as {
      content?: string;
      download_url?: string;
    };

    const readmeContent = readmeData?.content ? Buffer.from(readmeData.content, 'base64').toString('utf-8') : '';

    const branchFromDownloadUrl = extractBranchFromDownloadUrl(readmeData?.download_url);

    // Transform relative URLs to absolute URLs pointing to the correct repo
    return convertRelativeToAbsoluteUrls(readmeContent, owner, repo, branchFromDownloadUrl, 'README.md');
  } catch (error) {
    if (isGithubNotFoundError(error)) {
      console.warn(`[github-server] README not found for ${owner}/${repo}. Using placeholder content.`);
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
    // Fetch from GitHub repository
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: docPath,
    });

    if ('content' in response.data && response.data.type === 'file') {
      const content = Buffer.from(response.data.content, 'base64').toString();
      const branchFromDownloadUrl = extractBranchFromDownloadUrl(response.data.download_url);
      const normalizedContent = convertRelativeToAbsoluteUrls(
        content,
        owner,
        repo,
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

  const response = await octokit.rest.repos.getContent({
    owner,
    repo,
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
