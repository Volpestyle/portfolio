import { Octokit } from '@octokit/rest';
import { GH_CONFIG } from '@/lib/constants';
import { PortfolioConfig, PortfolioRepoConfig } from '@/types/portfolio';

let octokitInstance: Octokit | null = null;

export function resolveGitHubToken() {
  return process.env.GH_TOKEN ?? null;
}

/**
 * Creates or returns a singleton Octokit instance
 */
export function createOctokit(): Octokit {
  const token = resolveGitHubToken();
  if (!token) {
    throw new Error('GitHub token is not configured');
  }

  if (!octokitInstance) {
    octokitInstance = new Octokit({
      auth: token,
    });
  }
  return octokitInstance;
}

/**
 * Fetches the portfolio configuration from the configured gist
 */
export async function getPortfolioConfig(): Promise<PortfolioConfig | null> {
  const gistId = process.env.PORTFOLIO_GIST_ID;
  if (!gistId) {
    console.error('Portfolio gist ID not configured');
    return null;
  }

  try {
    const octokit = createOctokit();
    const gistResponse = await octokit.rest.gists.get({
      gist_id: gistId,
    });

    const portfolioFile = gistResponse.data.files?.[GH_CONFIG.PORTFOLIO_CONFIG_FILENAME];

    if (!portfolioFile || !portfolioFile.content) {
      return null;
    }

    return JSON.parse(portfolioFile.content) as PortfolioConfig;
  } catch (error) {
    console.error('Error fetching portfolio config:', error);
    return null;
  }
}

/**
 * Finds a repository configuration by owner and repo name
 */
export function findRepoConfig(
  portfolioConfig: PortfolioConfig,
  owner: string,
  repo: string
): PortfolioRepoConfig | undefined {
  return portfolioConfig.repositories.find(
    (r) => r.name === repo && (r.owner || GH_CONFIG.USERNAME) === owner
  );
}

/**
 * Gets the actual repository name, handling private repos with public counterparts
 */
export async function getActualRepoName(owner: string, repo: string): Promise<string> {
  const portfolioConfig = await getPortfolioConfig();

  if (!portfolioConfig) {
    return repo;
  }

  const repoConfig = findRepoConfig(portfolioConfig, owner, repo);

  if (repoConfig?.isPrivate) {
    if (repoConfig.publicRepo) {
      return repoConfig.publicRepo;
    }
    return `${repo}-public`;
  }

  return repo;
}

/**
 * Standard error response for not found resources
 */
export function notFoundResponse(resource: string = 'Resource'): Response {
  return Response.json({ error: `${resource} not found` }, { status: 404 });
}

/**
 * Standard error response for server errors
 */
export function serverErrorResponse(message: string = 'Internal server error'): Response {
  return Response.json({ error: message }, { status: 500 });
}

/**
 * Fetches README content from a gist
 */
export async function getReadmeFromGist(gistId: string): Promise<string | null> {
  try {
    const octokit = createOctokit();
    const gistResponse = await octokit.rest.gists.get({
      gist_id: gistId,
    });

    const files = gistResponse.data.files;

    if (!files || Object.keys(files).length === 0) {
      return null;
    }

    const firstFile = files[Object.keys(files)[0]];

    if (!firstFile || !firstFile.content) {
      return null;
    }

    return firstFile.content;
  } catch (error) {
    console.error('Error fetching README from gist:', error);
    return null;
  }
}
